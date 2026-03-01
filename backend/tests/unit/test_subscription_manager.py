import pytest
from unittest.mock import MagicMock, AsyncMock
from types import SimpleNamespace
from dt_robot_control.opcua.subscription_manager import SubscriptionManager
from dt_robot_control.opcua.subhandler import SubHandler


class FakeNode:
    """Fake OPC UA node for testing."""
    def __init__(self, node_id, display_name="TestNode", children=None):
        self.nodeid = MagicMock()
        self.nodeid.to_string.return_value = node_id
        self._display_name = display_name
        self._children = children or []
    
    async def get_children(self):
        return self._children
    
    async def read_display_name(self):
        return SimpleNamespace(Text=self._display_name)


@pytest.fixture
def mock_opcua_client():
    """Create a mock OPCUAClient."""
    client = MagicMock()
    client.client = MagicMock()  # asyncua.Client
    client.client.create_subscription = AsyncMock()
    client.client.get_node = MagicMock()
    client.url = "opc.tcp://test"  # used for URL-prefixed websocket messages
    return client


@pytest.fixture
def mock_websocket():
    """Create a mock WebSocket."""
    websocket = MagicMock()
    websocket.send_text = AsyncMock()
    return websocket


@pytest.fixture
def subscription_manager(mock_opcua_client, mock_websocket):
    """Create a SubscriptionManager instance."""
    return SubscriptionManager(mock_opcua_client, name="TestClient", websocket=mock_websocket)


# --- Initialization Tests ---

def test_subscription_manager_initialization(subscription_manager, mock_opcua_client, mock_websocket):
    """Test SubscriptionManager initializes correctly."""
    assert subscription_manager.opcua_client == mock_opcua_client
    assert subscription_manager.client == mock_opcua_client.client
    assert subscription_manager.name == "TestClient"
    assert subscription_manager.websocket == mock_websocket
    assert subscription_manager.expected_axes_count == 0
    assert subscription_manager.subscription is None
    assert subscription_manager.mode_subscription is None
    assert subscription_manager.mode_node is None
    assert subscription_manager.mode_sub_handler is None
    assert subscription_manager.custom_subscriptions == {}
    assert subscription_manager.event_subscription is None
    assert subscription_manager.event_handle is None
    assert isinstance(subscription_manager.sub_handler, SubHandler)


# --- Axes Subscription Tests ---

@pytest.mark.asyncio
async def test_subscribe_axes_actual_positions_success(subscription_manager, mock_opcua_client):
    """Test successful axes subscription."""
    # Create mock node hierarchy
    device_set = FakeNode("ns=2;i=1", "DeviceSet")
    axes_node = FakeNode("ns=2;i=2", "Axes")
    axis1 = FakeNode("ns=2;i=10", "Axis1")
    axis2 = FakeNode("ns=2;i=20", "Axis2")
    param_set1 = FakeNode("ns=2;i=11", "ParameterSet")
    param_set2 = FakeNode("ns=2;i=21", "ParameterSet")
    actual_pos1 = FakeNode("ns=2;i=12", "ActualPosition")
    actual_pos2 = FakeNode("ns=2;i=22", "ActualPosition")
    
    axes_node._children = [axis1, axis2]
    
    # Mock node_manager methods
    subscription_manager.node_manager.find_child_by_name = AsyncMock(return_value=device_set)
    subscription_manager.node_manager.find_descendant_by_name = AsyncMock()
    
    async def mock_find_descendant(node, name):
        if name == "Axes" and node == device_set:
            return axes_node
        elif name == "ParameterSet":
            if node == axis1:
                return param_set1
            elif node == axis2:
                return param_set2
        elif name == "ActualPosition":
            if node == param_set1:
                return actual_pos1
            elif node == param_set2:
                return actual_pos2
        return None
    
    subscription_manager.node_manager.find_descendant_by_name = AsyncMock(side_effect=mock_find_descendant)
    
    # Mock subscription
    mock_subscription = MagicMock()
    mock_subscription.subscribe_data_change = AsyncMock()
    mock_opcua_client.client.create_subscription = AsyncMock(return_value=mock_subscription)
    
    await subscription_manager.subscribe_axes_actual_positions()
    
    assert subscription_manager.expected_axes_count == 2
    assert subscription_manager.subscription == mock_subscription
    mock_subscription.subscribe_data_change.assert_called_once()


@pytest.mark.asyncio
async def test_subscribe_axes_no_device_set(subscription_manager):
    """Test axes subscription when DeviceSet is not found."""
    subscription_manager.node_manager.find_child_by_name = AsyncMock(return_value=None)
    
    await subscription_manager.subscribe_axes_actual_positions()
    
    assert subscription_manager.subscription is None
    assert subscription_manager.expected_axes_count == 0


@pytest.mark.asyncio
async def test_subscribe_axes_no_axes_node(subscription_manager):
    """Test axes subscription when Axes node is not found."""
    device_set = FakeNode("ns=2;i=1", "DeviceSet")
    subscription_manager.node_manager.find_child_by_name = AsyncMock(return_value=device_set)
    subscription_manager.node_manager.find_descendant_by_name = AsyncMock(return_value=None)
    
    await subscription_manager.subscribe_axes_actual_positions()
    
    assert subscription_manager.subscription is None


@pytest.mark.asyncio
async def test_stop_axes_subscription(subscription_manager):
    """Test stopping axes subscription."""
    mock_subscription = MagicMock()
    mock_subscription.delete = AsyncMock()
    subscription_manager.subscription = mock_subscription
    subscription_manager.sub_handler.latest_values = {"test": "data"}
    
    await subscription_manager.stop_axes_subscription()
    
    mock_subscription.delete.assert_called_once()
    assert subscription_manager.subscription is None
    assert subscription_manager.sub_handler.latest_values == {}


@pytest.mark.asyncio
async def test_stop_axes_subscription_with_error(subscription_manager):
    """Test stopping axes subscription handles errors gracefully."""
    mock_subscription = MagicMock()
    mock_subscription.delete = AsyncMock(side_effect=Exception("Delete failed"))
    subscription_manager.subscription = mock_subscription
    
    await subscription_manager.stop_axes_subscription()
    
    assert subscription_manager.subscription is None


# --- Mode Subscription Tests ---

@pytest.mark.asyncio
async def test_subscribe_mode_success(subscription_manager, mock_opcua_client):
    """Test successful mode subscription."""
    device_set = FakeNode("ns=2;i=1", "DeviceSet")
    robot_state = FakeNode("ns=2;i=100", "RobotState")
    
    subscription_manager.node_manager.find_child_by_name = AsyncMock(return_value=device_set)
    subscription_manager.node_manager.find_descendant_by_name = AsyncMock(return_value=robot_state)
    
    mock_subscription = MagicMock()
    mock_subscription.subscribe_data_change = AsyncMock()
    mock_opcua_client.client.create_subscription = AsyncMock(return_value=mock_subscription)
    
    await subscription_manager.subscribe_mode()
    
    assert subscription_manager.mode_node == robot_state
    assert subscription_manager.mode_subscription == mock_subscription
    assert subscription_manager.mode_sub_handler is not None
    mock_subscription.subscribe_data_change.assert_called_once_with(robot_state)


@pytest.mark.asyncio
async def test_subscribe_mode_no_device_set(subscription_manager):
    """Test mode subscription when DeviceSet is not found."""
    subscription_manager.node_manager.find_child_by_name = AsyncMock(return_value=None)
    
    await subscription_manager.subscribe_mode()
    
    assert subscription_manager.mode_subscription is None
    assert subscription_manager.mode_node is None


@pytest.mark.asyncio
async def test_subscribe_mode_no_robot_state(subscription_manager):
    """Test mode subscription when RobotState is not found."""
    device_set = FakeNode("ns=2;i=1", "DeviceSet")
    subscription_manager.node_manager.find_child_by_name = AsyncMock(return_value=device_set)
    subscription_manager.node_manager.find_descendant_by_name = AsyncMock(return_value=None)
    
    await subscription_manager.subscribe_mode()
    
    assert subscription_manager.mode_subscription is None


@pytest.mark.asyncio
async def test_stop_mode_subscription(subscription_manager):
    """Test stopping mode subscription."""
    mock_subscription = MagicMock()
    mock_subscription.delete = AsyncMock()
    subscription_manager.mode_subscription = mock_subscription
    subscription_manager.mode_node = "some_node"
    subscription_manager.mode_sub_handler = MagicMock()
    subscription_manager.mode_sub_handler.reset = MagicMock()
    
    await subscription_manager.stop_mode_subscription()
    
    mock_subscription.delete.assert_called_once()
    assert subscription_manager.mode_subscription is None
    assert subscription_manager.mode_node is None
    subscription_manager.mode_sub_handler.reset.assert_called_once()


# --- Custom Subscription Tests ---

@pytest.mark.asyncio
async def test_subscribe_custom(subscription_manager, mock_opcua_client, mock_websocket):
    """Test creating a custom subscription."""
    node_id = "ns=2;i=999"
    mock_node = FakeNode(node_id, "CustomNode")
    mock_opcua_client.client.get_node = MagicMock(return_value=mock_node)
    
    mock_subscription = MagicMock()
    mock_subscription.subscribe_data_change = AsyncMock()
    mock_opcua_client.client.create_subscription = AsyncMock(return_value=mock_subscription)
    
    result = await subscription_manager.subscribe_custom(node_id, mock_websocket)
    
    assert result == mock_subscription
    assert node_id in subscription_manager.custom_subscriptions
    assert subscription_manager.custom_subscriptions[node_id] == mock_subscription
    mock_opcua_client.client.get_node.assert_called_once_with(node_id)


@pytest.mark.asyncio
async def test_unsubscribe_custom_success(subscription_manager):
    """Test removing a custom subscription."""
    node_id = "ns=2;i=999"
    mock_subscription = MagicMock()
    mock_subscription.delete = AsyncMock()
    subscription_manager.custom_subscriptions[node_id] = mock_subscription
    
    result = await subscription_manager.unsubscribe_custom(node_id)
    
    assert result is True
    assert node_id not in subscription_manager.custom_subscriptions
    mock_subscription.delete.assert_called_once()


@pytest.mark.asyncio
async def test_unsubscribe_custom_not_found(subscription_manager):
    """Test removing a non-existent custom subscription."""
    result = await subscription_manager.unsubscribe_custom("ns=2;i=nonexistent")
    
    assert result is False


@pytest.mark.asyncio
async def test_unsubscribe_custom_with_error(subscription_manager):
    """Test removing custom subscription handles errors."""
    node_id = "ns=2;i=999"
    mock_subscription = MagicMock()
    mock_subscription.delete = AsyncMock(side_effect=Exception("Delete failed"))
    subscription_manager.custom_subscriptions[node_id] = mock_subscription
    
    result = await subscription_manager.unsubscribe_custom(node_id)
    
    assert result is False
    # Subscription should not be removed from dict on error
    assert node_id in subscription_manager.custom_subscriptions


# --- Event Subscription Tests ---

@pytest.mark.asyncio
async def test_subscribe_events_on_node_success(subscription_manager, mock_opcua_client):
    """Test subscribing to events on a node."""
    node_id = "ns=2;i=500"
    mock_node = FakeNode(node_id, "EventNode")
    mock_opcua_client.client.get_node = MagicMock(return_value=mock_node)
    
    mock_subscription = MagicMock()
    mock_handle = "event_handle_123"
    mock_subscription.subscribe_events = AsyncMock(return_value=mock_handle)
    mock_opcua_client.client.create_subscription = AsyncMock(return_value=mock_subscription)
    
    result = await subscription_manager.subscribe_events_on_node(node_id)
    
    assert result is True
    assert subscription_manager.event_subscription == mock_subscription
    assert subscription_manager.event_handle == mock_handle
    mock_subscription.subscribe_events.assert_called_once_with(mock_node)


@pytest.mark.asyncio
async def test_subscribe_events_on_node_with_error(subscription_manager, mock_opcua_client):
    """Test event subscription handles errors."""
    node_id = "ns=2;i=500"
    mock_opcua_client.client.get_node = MagicMock(side_effect=Exception("Node not found"))
    
    result = await subscription_manager.subscribe_events_on_node(node_id)
    
    assert result is False
    assert subscription_manager.event_subscription is None


@pytest.mark.asyncio
async def test_unsubscribe_events_success(subscription_manager):
    """Test unsubscribing from events."""
    mock_subscription = MagicMock()
    mock_handle = "event_handle_123"
    mock_subscription.unsubscribe = AsyncMock()
    mock_subscription.delete = AsyncMock()
    
    subscription_manager.event_subscription = mock_subscription
    subscription_manager.event_handle = mock_handle
    
    result = await subscription_manager.unsubscribe_events()
    
    assert result is True
    assert subscription_manager.event_subscription is None
    assert subscription_manager.event_handle is None
    mock_subscription.unsubscribe.assert_called_once_with(mock_handle)
    mock_subscription.delete.assert_called_once()


@pytest.mark.asyncio
async def test_unsubscribe_events_when_none(subscription_manager):
    """Test unsubscribing when no event subscription exists."""
    result = await subscription_manager.unsubscribe_events()
    
    assert result is False


@pytest.mark.asyncio
async def test_unsubscribe_events_with_error(subscription_manager):
    """Test unsubscribing from events handles errors."""
    mock_subscription = MagicMock()
    mock_subscription.unsubscribe = AsyncMock(side_effect=Exception("Unsubscribe failed"))
    
    subscription_manager.event_subscription = mock_subscription
    subscription_manager.event_handle = "handle"
    
    result = await subscription_manager.unsubscribe_events()
    
    assert result is False
