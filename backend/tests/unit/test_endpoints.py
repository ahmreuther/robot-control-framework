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


@pytest.mark.asyncio
async def test_browse_reuses_connected_client():
    child = MagicMock()
    child.nodeid.to_string.return_value = "ns=2;i=1001"
    child.read_browse_name = AsyncMock(return_value=SimpleNamespace(NamespaceIndex=2, Name="AxisA"))
    child.read_display_name = AsyncMock(return_value=SimpleNamespace(Text="Axis A"))
    child.read_node_class = AsyncMock(return_value=SimpleNamespace(name="Variable"))

    node = MagicMock()
    node.get_children = AsyncMock(return_value=[child])

    asyncua_client = MagicMock()
    asyncua_client.get_node.return_value = node

    wrapper = MagicMock(client=asyncua_client)
    client_registry.client_registry.add("opc.tcp://a", wrapper)

    res = await endpoints.browse(url="opc.tcp://a", node_id="i=84")
    assert res["url"] == "opc.tcp://a"
    assert res["nodeId"] == "i=84"
    assert len(res["children"]) == 1
    assert res["children"][0]["browseName"] == "2:AxisA"
    assert res["children"][0]["displayName"] == "Axis A"
    assert res["children"][0]["nodeClass"] == "Variable"


@pytest.mark.asyncio
async def test_get_root_node_reuses_connected_client():
    root = MagicMock()
    root.nodeid.to_string.return_value = "i=84"
    root.read_browse_name = AsyncMock(return_value=SimpleNamespace(NamespaceIndex=0, Name="Root"))
    root.read_display_name = AsyncMock(return_value=SimpleNamespace(Text="Root"))
    root.read_node_class = AsyncMock(return_value=SimpleNamespace(name="Object"))

    asyncua_client = MagicMock()
    asyncua_client.get_root_node.return_value = root

    wrapper = MagicMock(client=asyncua_client)
    client_registry.client_registry.add("opc.tcp://a", wrapper)

    res = await endpoints.get_root_node(url="opc.tcp://a")
    assert res["nodeId"] == "i=84"
    assert res["browseName"] == "0:Root"
    assert res["displayName"] == "Root"
    assert res["nodeClass"] == "Object"


@pytest.mark.asyncio
async def test_get_node_value_success():
    node = MagicMock()
    node.read_value = AsyncMock(return_value=42)

    asyncua_client = MagicMock()
    asyncua_client.get_node.return_value = node

    wrapper = MagicMock(client=asyncua_client)
    client_registry.client_registry.add("opc.tcp://a", wrapper)

    res = await endpoints.get_node_value(url="opc.tcp://a", nodeid="ns=2;i=123")
    assert res == {"nodeId": "ns=2;i=123", "value": 42}


@pytest.mark.asyncio
async def test_get_node_value_no_client():
    with pytest.raises(Exception) as exc:
        await endpoints.get_node_value(url="opc.tcp://missing", nodeid="n1")
    assert getattr(exc.value, "status_code", None) == 404


@pytest.mark.asyncio
async def test_get_node_details_variable_success():
    node = MagicMock()
    node.read_browse_name = AsyncMock(return_value=SimpleNamespace(NamespaceIndex=2, Name="VarA"))
    node.read_display_name = AsyncMock(return_value=SimpleNamespace(Text="Variable A"))
    node.read_node_class = AsyncMock(return_value=SimpleNamespace(name="Variable", value=2))
    node.read_description = AsyncMock(return_value=SimpleNamespace(Text="desc"))
    node.read_value = AsyncMock(return_value=12.5)
    node.read_data_type = AsyncMock(return_value=SimpleNamespace(to_string=lambda: "i=11"))
    node.read_attribute = AsyncMock(
        side_effect=[SimpleNamespace(Value=SimpleNamespace(Value=3))]
    )

    asyncua_client = MagicMock()
    asyncua_client.get_node.return_value = node

    wrapper = MagicMock(client=asyncua_client)
    client_registry.client_registry.add("opc.tcp://a", wrapper)

    res = await endpoints.get_node_details(url="opc.tcp://a", node_id="ns=2;i=123")
    assert res["nodeId"] == "ns=2;i=123"
    assert res["browseName"] == "2:VarA"
    assert res["displayName"] == "Variable A"
    assert res["nodeClass"] == "Variable"
    assert res["nodeClassValue"] == 2
    assert res["description"] == "desc"
    assert res["value"] == 12.5
    assert res["dataType"] == "i=11"
    assert res["accessLevel"] == 3


@pytest.mark.asyncio
async def test_get_node_details_object_success():
    node = MagicMock()
    node.read_browse_name = AsyncMock(return_value=SimpleNamespace(NamespaceIndex=1, Name="ObjA"))
    node.read_display_name = AsyncMock(return_value=SimpleNamespace(Text="Object A"))
    node.read_node_class = AsyncMock(return_value=SimpleNamespace(name="Object", value=1))
    node.read_description = AsyncMock(return_value=None)
    node.read_attribute = AsyncMock(
        side_effect=[SimpleNamespace(Value=SimpleNamespace(Value=1))]
    )

    asyncua_client = MagicMock()
    asyncua_client.get_node.return_value = node

    wrapper = MagicMock(client=asyncua_client)
    client_registry.client_registry.add("opc.tcp://a", wrapper)

    res = await endpoints.get_node_details(url="opc.tcp://a", node_id="ns=1;i=7")
    assert res["nodeClass"] == "Object"
    assert res["nodeClassValue"] == 1
    assert res["eventNotifier"] == 1
