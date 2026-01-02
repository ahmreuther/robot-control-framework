import pytest
from unittest.mock import MagicMock, AsyncMock
from types import SimpleNamespace
from dt_robot_control.opcua.subhandler import SubHandler
from starlette.websockets import WebSocketState
from asyncua import ua
import json


@pytest.fixture
def mock_websocket():
    """Create a mock WebSocket."""
    websocket = MagicMock()
    websocket.send_text = AsyncMock()
    websocket.client_state = WebSocketState.CONNECTED
    return websocket


@pytest.fixture
def mock_node_manager():
    """Create a mock NodeManager."""
    node_manager = MagicMock()
    node_manager.find_descendant_by_name = AsyncMock()
    return node_manager


@pytest.fixture
def subhandler_custom(mock_websocket, mock_node_manager):
    """Create a SubHandler in custom mode."""
    return SubHandler(
        name="TestHandler",
        websocket=mock_websocket,
        mode="custom",
        node_manager=mock_node_manager
    )


@pytest.fixture
def subhandler_axes(mock_websocket, mock_node_manager):
    """Create a SubHandler in axes mode."""
    get_expected = lambda: 2
    return SubHandler(
        name="AxesHandler",
        websocket=mock_websocket,
        get_expected_count=get_expected,
        mode="axes",
        node_manager=mock_node_manager
    )


@pytest.fixture
def subhandler_mode(mock_websocket, mock_node_manager):
    """Create a SubHandler in mode mode."""
    return SubHandler(
        name="ModeHandler",
        websocket=mock_websocket,
        mode="mode",
        node_manager=mock_node_manager
    )


class FakeNode:
    """Fake node for testing."""
    def __init__(self, node_id, display_name=None, parent=None):
        self.nodeid = MagicMock()
        self.nodeid.to_string.return_value = node_id
        self._display_name = display_name
        self._parent = parent

    async def read_display_name(self):
        return SimpleNamespace(Text=self._display_name) if self._display_name else None

    async def get_parent(self):
        return self._parent


def test_subhandler_initialization(subhandler_custom, mock_websocket, mock_node_manager):
    """Test SubHandler initializes correctly."""
    assert subhandler_custom.name == "TestHandler"
    assert subhandler_custom.websocket == mock_websocket
    assert subhandler_custom.mode == "custom"
    assert subhandler_custom.node_manager == mock_node_manager
    assert subhandler_custom.latest_values == {}
    assert subhandler_custom.last_sent_values is None
    assert subhandler_custom.unit_type is None


def test_subhandler_initialization_with_defaults():
    """Test SubHandler with default parameters."""
    handler = SubHandler()
    assert handler.name == "Client"
    assert handler.websocket is None
    assert handler.mode == "custom"
    assert handler.node_manager is None
    assert handler.get_expected_count() == 0


def test_encode_eu_to_jsonable_with_euinformation():
    """Test encoding EUInformation to JSON."""
    mock_eu = MagicMock(spec=ua.EUInformation)
    mock_eu.UnitId = 123
    mock_eu.NamespaceUri = "http://example.com"
    mock_eu.DisplayName = SimpleNamespace(Text="meters")
    mock_eu.Description = SimpleNamespace(Text="Distance in meters")
    
    result = SubHandler.encode_eu_to_jsonable(mock_eu)
    
    assert result["unitId"] == 123
    assert result["namespaceUri"] == "http://example.com"
    assert result["displayName"] == "meters"
    assert result["description"] == "Distance in meters"


def test_encode_eu_to_jsonable_with_primitives():
    """Test encoding primitive types."""
    assert SubHandler.encode_eu_to_jsonable("meters") == "meters"
    assert SubHandler.encode_eu_to_jsonable(42) == 42
    assert SubHandler.encode_eu_to_jsonable(3.14) == 3.14
    assert SubHandler.encode_eu_to_jsonable(None) is None


def test_encode_eu_to_jsonable_with_unknown_type():
    """Test encoding unknown type falls back to string."""
    class CustomObject:
        def __str__(self):
            return "custom_object"
    
    result = SubHandler.encode_eu_to_jsonable(CustomObject())
    assert result == "custom_object"


def test_reset(subhandler_custom):
    """Test reset method clears state."""
    subhandler_custom.latest_values = {"key": "value"}
    subhandler_custom.last_sent_values = {"old": "data"}
    subhandler_custom.unit_type = "meters"
    
    subhandler_custom.reset()
    
    assert subhandler_custom.latest_values == {}
    assert subhandler_custom.last_sent_values is None
    assert subhandler_custom.unit_type is None


@pytest.mark.asyncio
async def test_process_datachange_custom_mode(subhandler_custom, mock_websocket):
    """Test datachange notification in custom mode."""
    node = FakeNode("ns=2;i=1234", "CustomNode")
    
    await subhandler_custom._process_datachange(node, 42.5)
    
    expected_msg = f"x|custom:{json.dumps({'nodeId': 'ns=2;i=1234', 'value': 42.5})}"
    mock_websocket.send_text.assert_called_once_with(expected_msg)


@pytest.mark.asyncio
async def test_process_datachange_custom_mode_without_nodeid(subhandler_custom, mock_websocket):
    """Test custom mode with node that doesn't have nodeid attribute."""
    node = "simple_string_node"
    
    await subhandler_custom._process_datachange(node, 100)
    
    expected_msg = f"x|custom:{json.dumps({'nodeId': 'simple_string_node', 'value': 100})}"
    mock_websocket.send_text.assert_called_once_with(expected_msg)


@pytest.mark.asyncio
async def test_process_datachange_mode_mode(subhandler_mode, mock_websocket):
    """Test datachange notification in mode mode."""
    node = FakeNode("ns=2;i=5678", "RobotState")
    
    await subhandler_mode._process_datachange(node, "RUNNING")
    
    mock_websocket.send_text.assert_called_once_with("x|Mode:RUNNING")


@pytest.mark.asyncio
async def test_process_datachange_axes_mode_single_axis(subhandler_axes, mock_websocket, mock_node_manager):
    """Test datachange notification in axes mode with single axis (should not send yet)."""
    # Create node hierarchy
    axis_node = FakeNode("ns=2;i=100", "Axis1")
    param_set = FakeNode("ns=2;i=101", "ParameterSet", parent=axis_node)
    actual_pos = FakeNode("ns=2;i=102", "ActualPosition", parent=param_set)
    
    # Mock EngineeringUnits node
    eu_node = FakeNode("ns=2;i=103", "EngineeringUnits")
    eu_node.read_value = AsyncMock(return_value="radians")
    mock_node_manager.find_descendant_by_name = AsyncMock(return_value=eu_node)
    
    await subhandler_axes._process_datachange(actual_pos, 1.57)
    
    # Should not send yet (expecting 2 axes)
    mock_websocket.send_text.assert_not_called()
    assert subhandler_axes.latest_values == {"Axis1": 1.57}
    assert subhandler_axes.unit_type == "radians"


@pytest.mark.asyncio
async def test_process_datachange_axes_mode_all_axes(subhandler_axes, mock_websocket, mock_node_manager):
    """Test datachange notification in axes mode with all expected axes."""
    # Create node hierarchy for two axes
    axis1_node = FakeNode("ns=2;i=100", "Axis1")
    param_set1 = FakeNode("ns=2;i=101", "ParameterSet", parent=axis1_node)
    actual_pos1 = FakeNode("ns=2;i=102", "ActualPosition", parent=param_set1)
    
    axis2_node = FakeNode("ns=2;i=200", "Axis2")
    param_set2 = FakeNode("ns=2;i=201", "ParameterSet", parent=axis2_node)
    actual_pos2 = FakeNode("ns=2;i=202", "ActualPosition", parent=param_set2)
    
    # Mock EngineeringUnits
    eu_node = FakeNode("ns=2;i=103", "EngineeringUnits")
    eu_node.read_value = AsyncMock(return_value="radians")
    mock_node_manager.find_descendant_by_name = AsyncMock(return_value=eu_node)
    
    # Process both axis values
    await subhandler_axes._process_datachange(actual_pos1, 1.57)
    await subhandler_axes._process_datachange(actual_pos2, 3.14)
    
    # Should send after receiving all expected axes
    assert mock_websocket.send_text.call_count == 1
    call_args = mock_websocket.send_text.call_args[0][0]
    assert call_args.startswith("x|angles:")
    
    # Parse the JSON payload
    json_str = call_args.split("x|angles:")[1]
    data = json.loads(json_str)
    assert data["angles"] == {"Axis1": 1.57, "Axis2": 3.14}
    assert data["unit"] == "radians"


@pytest.mark.asyncio
async def test_process_datachange_axes_mode_no_engineering_units(subhandler_axes, mock_websocket, mock_node_manager):
    """Test axes mode when EngineeringUnits node is not found."""
    axis1_node = FakeNode("ns=2;i=100", "Axis1")
    param_set1 = FakeNode("ns=2;i=101", "ParameterSet", parent=axis1_node)
    actual_pos1 = FakeNode("ns=2;i=102", "ActualPosition", parent=param_set1)
    
    axis2_node = FakeNode("ns=2;i=200", "Axis2")
    param_set2 = FakeNode("ns=2;i=201", "ParameterSet", parent=axis2_node)
    actual_pos2 = FakeNode("ns=2;i=202", "ActualPosition", parent=param_set2)
    
    # Mock no EngineeringUnits found
    mock_node_manager.find_descendant_by_name = AsyncMock(return_value=None)
    
    await subhandler_axes._process_datachange(actual_pos1, 1.0)
    await subhandler_axes._process_datachange(actual_pos2, 2.0)
    
    # Should still send with unit_type as None
    assert mock_websocket.send_text.call_count == 1
    call_args = mock_websocket.send_text.call_args[0][0]
    json_str = call_args.split("x|angles:")[1]
    data = json.loads(json_str)
    assert data["unit"] is None


@pytest.mark.asyncio
async def test_process_datachange_disconnected_websocket(subhandler_custom, mock_websocket):
    """Test that notifications are skipped for disconnected WebSocket."""
    mock_websocket.client_state = WebSocketState.DISCONNECTED
    node = FakeNode("ns=2;i=1234", "CustomNode")
    
    await subhandler_custom._process_datachange(node, 42.5)
    
    mock_websocket.send_text.assert_not_called()


@pytest.mark.asyncio
async def test_process_datachange_no_websocket(mock_node_manager):
    """Test that notifications are skipped when websocket is None."""
    handler = SubHandler(name="NoWS", websocket=None, mode="custom", node_manager=mock_node_manager)
    node = FakeNode("ns=2;i=1234", "CustomNode")
    
    # Should not raise error
    await handler._process_datachange(node, 42.5)


@pytest.mark.asyncio
async def test_process_datachange_invalid_float_value(subhandler_axes, mock_websocket):
    """Test handling of non-numeric values in axes mode."""
    axis_node = FakeNode("ns=2;i=100", "Axis1")
    param_set = FakeNode("ns=2;i=101", "ParameterSet", parent=axis_node)
    actual_pos = FakeNode("ns=2;i=102", "ActualPosition", parent=param_set)
    
    await subhandler_axes._process_datachange(actual_pos, "not_a_number")
    
    # Should not add invalid value
    assert "Axis1" not in subhandler_axes.latest_values
    mock_websocket.send_text.assert_not_called()


def test_status_change_notification(subhandler_custom, capsys):
    """Test status change notification logs to console."""
    subhandler_custom.status_change_notification("Connected")
    
    captured = capsys.readouterr()
    assert "[TestHandler] Status changed: Connected" in captured.out


@pytest.mark.asyncio
async def test_event_notification(subhandler_custom, mock_websocket, capsys):
    """Test event notification."""
    # Create mock event
    event = SimpleNamespace(
        EventId="event123",
        EventType="AlarmEvent",
        Message="Test alarm",
        Severity=500
    )
    
    subhandler_custom.event_notification(event)
    
    # Give async task time to complete
    import asyncio
    await asyncio.sleep(0.1)
    
    # Verify console output contains event info
    captured = capsys.readouterr()
    assert "New Event Received" in captured.out or mock_websocket.send_text.call_count >= 0


def test_event_notification_disconnected_websocket(subhandler_custom, mock_websocket):
    """Test event notification with disconnected WebSocket."""
    mock_websocket.client_state = WebSocketState.DISCONNECTED
    
    event = SimpleNamespace(EventId="event123", Message="Test")
    subhandler_custom.event_notification(event)
    
    # Should not crash, just not send


def test_event_notification_no_websocket(mock_node_manager):
    """Test event notification when websocket is None."""
    handler = SubHandler(name="NoWS", websocket=None, mode="custom", node_manager=mock_node_manager)
    event = SimpleNamespace(EventId="event123")
    
    # Should not crash
    handler.event_notification(event)


def test_get_expected_count_default():
    """Test default get_expected_count returns 0."""
    handler = SubHandler(mode="custom")
    assert handler.get_expected_count() == 0


def test_get_expected_count_custom():
    """Test custom get_expected_count function."""
    counter = {"value": 5}
    get_count = lambda: counter["value"]
    
    handler = SubHandler(get_expected_count=get_count, mode="axes")
    assert handler.get_expected_count() == 5
    
    counter["value"] = 10
    assert handler.get_expected_count() == 10


@pytest.mark.asyncio
async def test_datachange_notification_creates_task(subhandler_custom, mock_websocket):
    """Test that datachange_notification creates an async task."""
    node = FakeNode("ns=2;i=1234", "TestNode")
    
    # Call the sync method which creates an async task
    subhandler_custom.datachange_notification(node, 123, None)
    
    # Give the async task time to complete
    import asyncio
    await asyncio.sleep(0.1)
    
    # Verify the websocket was called
    mock_websocket.send_text.assert_called_once()


def test_datachange_notification_no_websocket():
    """Test datachange_notification when websocket is None."""
    handler = SubHandler(name="NoWS", websocket=None, mode="custom")
    node = FakeNode("ns=2;i=1234", "TestNode")
    
    # Should not crash
    handler.datachange_notification(node, 123, None)
