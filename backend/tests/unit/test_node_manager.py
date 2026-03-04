import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from types import SimpleNamespace
from dt_robot_control.opcua.node_manager import NodeManager
from asyncua import ua

@pytest.fixture
def mock_opcua_client():
    mock_opcua_client = MagicMock() # Mock OPCUA client
    mock_opcua_client.name = "MockOPCUAClient"
    mock_opcua_client.namespaces = ["http://example.com/namespace1", "http://example.com/namespace2"]
    mock_opcua_client.client = AsyncMock()  # Mock async client methods
    return mock_opcua_client

@pytest.fixture
def node_manager(mock_opcua_client):
    return NodeManager(mock_opcua_client)


class FakeNode:
        def __init__(self, nid, display_name=None, browse_name=None, node_class=None, children=None, input_args=None):
            self.nodeid = MagicMock()
            self.nodeid.to_string.return_value = nid
            
            self._display_name = display_name
            self._browse_name = browse_name
            self._node_class = node_class
            self._children = children or []
            self._input_args = input_args or []

        async def get_children(self):
            return self._children
        
        async def read_display_name(self):
            return SimpleNamespace(Text=self._display_name) if self._display_name else None

        async def read_browse_name(self):
            return SimpleNamespace(Name=self._browse_name, NamespaceIndex=0) if self._browse_name else None

        async def read_node_class(self):
            return self._node_class

        async def get_child(self, _):
            return self

        async def read_value(self):
            return self._input_args


def test_norm(node_manager):
    assert node_manager._norm("  Test String  ") == "teststring"
    assert node_manager._norm("") == ""
    assert node_manager._norm(None) == ""

@pytest.mark.asyncio
async def test_bfs_traversal(node_manager):
    
    # Create mock nodes
    grandchild12 = FakeNode("grandchild1.2")
    grandchild11 = FakeNode("grandchild1.1")
    child2 = FakeNode("child2")
    child1 = FakeNode("child1", children=[grandchild11, grandchild12])
    root = FakeNode("root", children=[child1, child2])
    # Run BFS generator and collect results to test order
    nodes = []
    async for node in node_manager._bfs(root):
        nodes.append(node)
    
    assert nodes == [root, child1, child2, grandchild11, grandchild12]

@pytest.mark.asyncio
async def test_bfs_cycle_prevention(node_manager):
    root = FakeNode("root")
    child = FakeNode("child")
    root._children = [child]
    child._children = [root]

    # Run BFS
    nodes = []
    async for node in node_manager._bfs(root):
        nodes.append(node)
    # Nodes should be only visited once
    assert nodes == [root, child]

@pytest.mark.asyncio
async def test_find_descendant_by_name(node_manager):
    target_node = FakeNode("target", display_name="MyNode", browse_name="OtherNode")
    root = FakeNode("root", children=[target_node])

    # Test finding via display name
    result = await node_manager.find_descendant_by_name(root, "MyNode")
    assert result == target_node

    # Test finding via browse name
    result = await node_manager.find_descendant_by_name(root, "OtherNode")
    assert result == target_node

    # Test not found case
    result = await node_manager.find_descendant_by_name(root, "Nope")
    assert result is None

@pytest.mark.asyncio
async def test_find_by_browse_name(node_manager):
    target = FakeNode("target", browse_name="BrowseTarget")
    root = FakeNode("root", children=[target])

    result = await node_manager._find_by_browse_name(root, "BrowseTarget")
    assert result == target

    result = await node_manager._find_by_browse_name(root, "Nope")
    assert result is None

    # Empty target short-circuits
    result = await node_manager._find_by_browse_name(root, "   ")
    assert result is None


@pytest.mark.asyncio
async def test_find_child_by_name(node_manager):
    target = FakeNode("target", display_name="ChildNode", browse_name="ChildNode")
    start_node = FakeNode("root", children=[target])

    node_manager.client.nodes.root.get_child = AsyncMock(return_value=start_node)

    result = await node_manager.find_child_by_name(["0:Objects"], "ChildNode")
    assert result == target

    result = await node_manager.find_child_by_name(["0:Objects"], "Nope")
    assert result is None


def _make_method(name, input_args=None):
    method = FakeNode(name, browse_name=name)
    method.read_node_class = AsyncMock(return_value=ua.NodeClass.Method)
    if input_args:
        ia_node = FakeNode("InputArguments", input_args=input_args)
        method._children = [ia_node]
        method.get_child = AsyncMock(return_value=ia_node)
    else:
        method.get_child = AsyncMock(side_effect=Exception("No InputArguments"))
    return method


@pytest.mark.asyncio
async def test_find_method_by_names(node_manager):
    #  name match: -> score 1
    method1 = _make_method("MethodBasic", [SimpleNamespace(Name="position", DataType=SimpleNamespace(Identifier=ua.ObjectIds.Int32), ValueRank=1)])
    method2 = _make_method("MethodFloat", [SimpleNamespace(Name="speed", DataType=SimpleNamespace(Identifier=ua.ObjectIds.Float), ValueRank=1)])
    method3 = _make_method("MethodJoint", [SimpleNamespace(Name="jointAngles", DataType=SimpleNamespace(Identifier=ua.ObjectIds.Double), ValueRank=1)])


    # DeviceSet node containing all methods
    deviceset = FakeNode("DeviceSet", children=[method1, method2, method3])
    node_manager.client.nodes.root.get_child = AsyncMock(return_value=deviceset)

    # Joint argument match. Should return method3 with score 3 when searching all names
    node, score = await node_manager.find_method_by_names(["MethodBasic", "MethodFloat", "MethodJoint"], return_score=True)
    assert node == method3
    assert score == 3

    # Float array argument match
    node, score = await node_manager.find_method_by_names(["MethodFloat"], return_score=True)
    assert node == method2
    assert score == 2

    # Name match only
    node, score = await node_manager.find_method_by_names(["MethodBasic"], return_score=True)
    assert node == method1
    assert score == 1

    # No match
    node, score = await node_manager.find_method_by_names(["Nope"], return_score=True)
    assert node is None
    assert score == -1

    # return_score=False path
    node_only = await node_manager.find_method_by_names(["MethodJoint"], return_score=False)
    assert node_only == method3


@pytest.mark.asyncio
async def test_find_method_by_names_missing_input_args(node_manager):
    method = _make_method("ErrMethod", input_args=None)
    deviceset = FakeNode("DeviceSet", children=[method])
    node_manager.client.nodes.root.get_child = AsyncMock(return_value=deviceset)

    node, score = await node_manager.find_method_by_names(["ErrMethod"], return_score=True)
    assert node == method
    assert score == 1

@pytest.mark.asyncio
async def test_browse_objects_print(node_manager):
    child1 = FakeNode("c1", display_name="Child1")
    child2 = FakeNode("c2", display_name="Child2")
    parent = FakeNode("parent", children=[child1, child2])

    children = await parent.get_children()
    assert children == [child1, child2]

    await node_manager.browse_objects(parent)

    dn1 = await child1.read_display_name()
    dn2 = await child2.read_display_name()
    assert dn1.Text == "Child1"
    assert dn2.Text == "Child2"


@pytest.mark.asyncio
async def test_find_child_by_name_error(node_manager):
    node_manager.client.nodes.root.get_child = AsyncMock(side_effect=Exception("err"))
    result = await node_manager.find_child_by_name(["0:Objects"], "X")
    assert result is None


@pytest.mark.asyncio
async def test_find_descendant_by_name_empty_target(node_manager):
    root = FakeNode("root")
    result = await node_manager.find_descendant_by_name(root, "")
    assert result is None


@pytest.mark.asyncio
async def test_bfs_handles_nodeid_and_children_errors(node_manager):
    class BadNode:
        def __init__(self):
            self.nodeid = MagicMock()
            self.nodeid.to_string.side_effect = Exception("badid")
        async def get_children(self):
            return []

    class BadChildNode(FakeNode):
        async def get_children(self):
            raise Exception("kids")

    bad = BadNode()
    child_err = BadChildNode("child")
    root = FakeNode("root", children=[bad, child_err])

    nodes = []
    async for node in node_manager._bfs(root):
        nodes.append(node)
    # bad node skipped, child_err yielded
    assert child_err in nodes


@pytest.mark.asyncio
async def test_safe_read_helpers_error_returns_empty(node_manager):
    class Bad:
        async def read_display_name(self):
            raise Exception("x")
        async def read_browse_name(self):
            raise Exception("y")

    dn, dn_txt = await node_manager._safe_read_display_name(Bad())
    bn, bn_txt = await node_manager._safe_read_browse_name(Bad())
    assert dn is None and dn_txt == ""
    assert bn is None and bn_txt == ""


@pytest.mark.asyncio
async def test_find_method_by_names_exception_path(node_manager):
    async def bad_bfs(_):
        class BadNode:
            async def read_display_name(self):
                raise Exception("dn")
            async def read_browse_name(self):
                raise Exception("bn")
        yield BadNode()

    with patch.object(node_manager, "_bfs", bad_bfs):
        node, score = await node_manager.find_method_by_names(["x"], return_score=True)
    assert node is None and score == -1


@pytest.mark.asyncio
async def test_find_method_by_names_exception_continue(node_manager):
    async def bad_bfs(_):
        class Bad(FakeNode):
            def __init__(self):
                super().__init__("bad", browse_name="hit")
            async def read_display_name(self):
                raise Exception("dn")
            async def read_browse_name(self):
                raise Exception("bn")
        yield Bad()

    with patch.object(node_manager, "_bfs", bad_bfs):
        node, score = await node_manager.find_method_by_names(["hit"], return_score=True)
    assert node is None and score == -1


@pytest.mark.asyncio
async def test_find_method_by_names_outer_exception(node_manager):
    async def one_node(_):
        yield FakeNode("n", browse_name="hit", node_class=ua.NodeClass.Method)

    with patch.object(node_manager, "_bfs", one_node):
        with patch.object(node_manager, "_safe_read_display_name", AsyncMock(side_effect=Exception("fail"))):
            node, score = await node_manager.find_method_by_names(["hit"], return_score=True)

    assert node is None and score == -1


@pytest.mark.asyncio
async def test_browse_objects_handles_read_errors(node_manager):
    class BadChild(FakeNode):
        async def read_display_name(self):
            raise Exception("fail")

    parent = FakeNode("p", children=[BadChild("c")])
    await node_manager.browse_objects(parent)  # should not raise