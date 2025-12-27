import pytest
from unittest.mock import MagicMock, AsyncMock
from dt_robot_control.opcua.node_manager import NodeManager

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

def test_norm(node_manager):
    assert node_manager._norm("  Test String  ") == "teststring"
    assert node_manager._norm("") == ""
    assert node_manager._norm(None) == ""

class FakeNode:
        def __init__(self, nid, children=None):
            self.nodeid = MagicMock()
            self.nodeid.to_string.return_value = nid
            self._children = children or []

        async def get_children(self):
            return self._children
        
@pytest.mark.asyncio
async def test_bfs_traversal(node_manager):
    
    # Create mock nodes
    grandchild12 = FakeNode("grandchild1.2")
    grandchild11 = FakeNode("grandchild1.1")
    child2 = FakeNode("child2")
    child1 = FakeNode("child1", [grandchild11, grandchild12])
    root = FakeNode("root", [child1, child2])
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