import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from dt_robot_control.opcua import endpoints
from dt_robot_control.services import client_registry


class DummyTemplate:
    def __init__(self):
        self.calls = []

    def TemplateResponse(self, name, ctx):
        self.calls.append((name, ctx))
        return {"name": name, "ctx": ctx}


@pytest.fixture(autouse=True)
def clear_clients():
    client_registry.client_registry.clear()
    yield
    client_registry.client_registry.clear()


def test_get_client_helper():
    sentinel = object()
    client_registry.client_registry.add("opc.tcp://a", sentinel)
    assert endpoints.get_client("opc.tcp://a") is sentinel


@pytest.mark.asyncio
async def test_get_device_set_no_client(monkeypatch):
    tmpl = DummyTemplate()
    monkeypatch.setattr(endpoints, "templates", tmpl)
    resp = await endpoints.get_device_set(request=MagicMock(), url="opc.tcp://none")
    assert resp["ctx"]["error"].startswith("No OPC UA client connected")


@pytest.mark.asyncio
async def test_get_device_set_success(monkeypatch):
    tmpl = DummyTemplate()
    monkeypatch.setattr(endpoints, "templates", tmpl)
    fake_root = MagicMock()
    fake_root_node = MagicMock()
    fake_root_node.get_root_node.return_value = fake_root

    fake_client = MagicMock(client=fake_root_node)
    client_registry.client_registry.add("opc.tcp://a", fake_client)
    with patch("dt_robot_control.opcua.endpoints.collect_node_details", AsyncMock(return_value={"ok": True})):
        resp = await endpoints.get_device_set(request=MagicMock(), url="opc.tcp://a")
    assert resp["ctx"]["items"]["ok"] is True


@pytest.mark.asyncio
async def test_get_device_set_exception(monkeypatch):
    tmpl = DummyTemplate()
    monkeypatch.setattr(endpoints, "templates", tmpl)
    bad_client = MagicMock()
    bad_client.client.get_root_node.side_effect = Exception("boom")
    client_registry.client_registry.add("opc.tcp://a", bad_client)
    resp = await endpoints.get_device_set(request=MagicMock(), url="opc.tcp://a")
    assert resp["ctx"]["error"] == "boom"


@pytest.mark.asyncio
async def test_subtree_and_node_no_client(monkeypatch):
    tmpl = DummyTemplate()
    monkeypatch.setattr(endpoints, "templates", tmpl)
    res_children = await endpoints.subtree_children(request=MagicMock(), url="opc.tcp://missing", nodeid="n1")
    res_node = await endpoints.node_rendered(request=MagicMock(), url="opc.tcp://missing", nodeid="n1")
    assert res_children == "No OPC UA client connected"
    assert res_node == "No OPC UA client for this URL"


@pytest.mark.asyncio
async def test_get_references_success(monkeypatch):
    # build fake ref objects
    class Ref:
        def __init__(self, rt, node_id, browse, type_def):
            self.ReferenceTypeId = rt
            self.NodeId = node_id
            self.BrowseName = browse
            self.TypeDefinition = type_def

    class FakeNodeId:
        def __init__(self, s, ident=1):
            self._s = s
            self.Identifier = ident
        def to_string(self):
            return self._s

    class DN:
        def __init__(self, t):
            self.Text = t

    dn_node = MagicMock()
    dn_node.read_display_name = AsyncMock(return_value=DN("TypeName"))

    ref1 = Ref(FakeNodeId("ref1"), FakeNodeId("node1"), MagicMock(to_string=lambda: "browse"), FakeNodeId("type1", ident=1))
    ref2 = Ref(FakeNodeId("ref2"), FakeNodeId("node2"), MagicMock(to_string=lambda: "browse2"), FakeNodeId(0, ident=0))

    fake_client = MagicMock()
    fake_node = MagicMock()
    fake_node.get_references = AsyncMock(return_value=["skip", ref1, ref2])
    fake_client.client.get_node.return_value = fake_node
    fake_client.client.get_node.return_value.read_display_name = dn_node.read_display_name
    client_registry.client_registry.add("opc.tcp://a", fake_client)

    res = await endpoints.get_references(url="opc.tcp://a", nodeid="n1")
    assert isinstance(res, list)
    assert res[0]["ReferenceType"].startswith("TypeName")
    assert res[1]["TypeDefinition"] == "Null"


@pytest.mark.asyncio
async def test_get_references_no_client():
    res = await endpoints.get_references(url="opc.tcp://missing", nodeid="n1")
    assert res["error"].startswith("No OPC UA client")


@pytest.mark.asyncio
async def test_get_references_safe_display_name_error(monkeypatch):
    class Ref:
        def __init__(self, rt, node_id, browse, type_def):
            self.ReferenceTypeId = rt
            self.NodeId = node_id
            self.BrowseName = browse
            self.TypeDefinition = type_def

    class FakeNodeId:
        def __init__(self, s, ident=1):
            self._s = s
            self.Identifier = ident
        def to_string(self):
            return self._s

    ref = Ref(FakeNodeId("ref1"), FakeNodeId("node1"), MagicMock(to_string=lambda: "browse"), FakeNodeId(0, ident=0))

    fake_client = MagicMock()
    fake_node = MagicMock()
    fake_node.get_references = AsyncMock(return_value=["skip", ref])

    def get_node_side_effect(node_id):
        if node_id is ref.ReferenceTypeId:
            raise Exception("dn fail")
        return fake_node

    fake_client.client.get_node.side_effect = get_node_side_effect
    client_registry.client_registry.add("opc.tcp://a", fake_client)

    res = await endpoints.get_references(url="opc.tcp://a", nodeid="n1")
    assert isinstance(res, list)
    assert res[0]["ReferenceType"].startswith("null")


@pytest.mark.asyncio
async def test_node_rendered_and_children(monkeypatch):
    tmpl = DummyTemplate()
    monkeypatch.setattr(endpoints, "templates", tmpl)
    fake_node = MagicMock()
    fake_client = MagicMock()
    fake_client.client.get_node.return_value = fake_node
    client_registry.client_registry.add("opc.tcp://a", fake_client)
    with patch("dt_robot_control.opcua.endpoints.collect_node_details", AsyncMock(return_value={"n":1})):
        resp = await endpoints.node_rendered(request=MagicMock(), url="opc.tcp://a", nodeid="n1")
        resp2 = await endpoints.subtree_children(request=MagicMock(), url="opc.tcp://a", nodeid="n1")
    assert resp["ctx"]["item"] == {"n":1}
    assert resp2["ctx"]["items"]["n"] == 1


@pytest.mark.asyncio
async def test_references_error(monkeypatch):
    fake_client = MagicMock()
    fake_client.client.get_node.side_effect = Exception("boom")
    client_registry.client_registry.add("opc.tcp://a", fake_client)
    res = await endpoints.get_references(url="opc.tcp://a", nodeid="n1")
    assert res["error"] == "boom"
