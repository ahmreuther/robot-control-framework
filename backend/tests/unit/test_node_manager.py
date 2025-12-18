import pytest
from unittest.mock import MagicMock, AsyncMock
from backend.src.opcua.node_manager import NodeManager

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

@pytest.mark.asyncio
async def test_bfs_traversal(node_manager):
    # Create mock nodes
    root = AsyncMock
    child1 = AsyncMock()
    child2 = AsyncMock()
    grandchild11 = AsyncMock()
    grandchild12 = AsyncMock()


    # Set node.id values for identification. They are unique in the OPCUA context
    # This is need to test for cycle-proof traversal
    root.nodeid.to_string.return_value = "root"
    child1.nodeid.to_string.return_value = "child1"
    child2.nodeid.to_string.return_value = "child2"
    grandchild11.nodeid.to_string.return_value = "grandchild1.1"
    grandchild12.nodeid.to_string.return_value = "grandchild1.2"

    # Set up children relationship to each other
    root.get_children = AsyncMock(return_value=[child1, child2])
    child1.get_children = AsyncMock(return_value=[grandchild11, grandchild12])
    child2.get_children = AsyncMock(return_value=[])
    grandchild11.get_children = AsyncMock(return_value=[])
    grandchild12.get_children = AsyncMock(return_value=[])

    # Run BFS generator and collect results to test order
    nodes = []
    async for node in node_manager._bfs(root):
        nodes.append(node)
    
    assert nodes == [root, child1, child2, grandchild11, grandchild12]

@pytest.mark.asyncio
async def test_bfs_cycle_prevention(node_manager):
    root = AsyncMock()
    child = AsyncMock()
    # Create cyclic relationship: root -> child -> root -> ...
    root.nodeid.to_string.return_value = "root"
    child.nodeid.to_string.return_value = "child"

    root.get_children = AsyncMock(return_value=[child])
    child.get_children = AsyncMock(return_value=[root])

    # Run BFS
    nodes = []
    async for node in node_manager._bfs(root):
        nodes.append(node)
    # Nodes should be only visited once
    assert nodes == [root, child]