import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from types import SimpleNamespace
from dt_robot_control.opcua.opcua_client import OPCUAClient
from starlette.websockets import WebSocketState
from asyncua import ua
from asyncua.ua.uatypes import VariantType


def _create_task_and_close(coro):
    """Test helper: mimic create_task but avoid leaking an un-awaited coroutine."""
    coro.close()
    return MagicMock(name="fake_task")


class FakeNode:
    """Fake OPC UA node for testing."""
    def __init__(self, node_id, display_name="TestNode", value=None, children=None):
        self.nodeid = MagicMock()
        self.nodeid.to_string.return_value = node_id
        self._display_name = display_name
        self._value = value
        self._children = children or []
        self._parent = None
    
    async def read_value(self):
        return self._value
    
    async def get_children(self):
        return self._children
    
    async def read_display_name(self):
        return SimpleNamespace(Text=self._display_name)
    
    async def get_parent(self):
        return self._parent
    
    async def get_child(self, path):
        if self._children:
            return self._children[0]
        return FakeNode("ns=0;i=85", "Objects")
    
    async def call_method(self, method_node, *args):
        """Mock method call."""
        return SimpleNamespace(
            StatusCode="Good",
            OutputArguments=["Success"]
        )


@pytest.fixture
def mock_websocket():
    """Create a mock WebSocket."""
    websocket = MagicMock()
    websocket.send_text = AsyncMock()
    websocket.client_state = WebSocketState.CONNECTED
    return websocket


@pytest.fixture
def mock_client():
    """Create a mock asyncua.Client."""
    client = MagicMock()
    client.connect = AsyncMock()
    client.disconnect = AsyncMock()
    client.get_node = MagicMock()
    client.nodes = MagicMock()
    client.nodes.root = FakeNode("i=84", "Root")
    return client


@pytest.fixture
def opcua_client(mock_websocket):
    """Create an OPCUAClient instance."""
    with patch('dt_robot_control.opcua.opcua_client.Client') as mock_client_class:
        mock_client_instance = MagicMock()
        mock_client_class.return_value = mock_client_instance
        
        client = OPCUAClient(
            url="opc.tcp://localhost:4840",
            name="TestClient",
            websocket=mock_websocket
        )
        
        # Replace with our mock
        client.client = mock_client_instance
        return client


# --- Initialization Tests ---

def test_opcua_client_initialization():
    """Test OPCUAClient initializes correctly."""
    with patch('dt_robot_control.opcua.opcua_client.Client'):
        client = OPCUAClient(url="opc.tcp://test:4840", name="TestClient")
        
        assert client.name == "TestClient"
        assert client.url == "opc.tcp://test:4840"
        assert client.websocket is None
        assert client.is_robotics_server is False
        assert client.namespaces == []
        assert client.goto_method_nodeid is None
        assert client.toggle_endeff_method_nodeid is None
        assert client.running is False


def test_opcua_client_initialization_with_websocket(mock_websocket):
    """Test OPCUAClient initialization with WebSocket."""
    with patch('dt_robot_control.opcua.opcua_client.Client'):
        client = OPCUAClient(
            url="opc.tcp://test:4840",
            name="TestClient",
            websocket=mock_websocket
        )
        
        assert client.websocket == mock_websocket


# --- Connection Tests ---

@pytest.mark.asyncio
async def test_connect_success(opcua_client):
    """Test successful connection to OPC UA server."""
    # Mock namespace array node
    namespace_node = FakeNode("i=2255", "NamespaceArray", value=["http://opcfoundation.org/UA/"])
    opcua_client.client.get_node = MagicMock(return_value=namespace_node)
    opcua_client.client.connect = AsyncMock()
    opcua_client.client.nodes.root = FakeNode("i=84", "Root")
    
    # Mock node_manager methods
    opcua_client.node_manager.browse_objects = AsyncMock()
    
    with patch.object(opcua_client, 'has_robotics_namespace', return_value=False):
        with patch('asyncio.create_task', side_effect=_create_task_and_close):
            await opcua_client.connect()
    
    assert opcua_client.running is True
    assert opcua_client.namespaces == ["http://opcfoundation.org/UA/"]
    opcua_client.client.connect.assert_called_once()


@pytest.mark.asyncio
async def test_connect_with_robotics_namespace(opcua_client):
    """Test connection with robotics namespace detection."""
    namespace_node = FakeNode(
        "i=2255",
        "NamespaceArray",
        value=["http://opcfoundation.org/UA/", "http://opcfoundation.org/UA/Robotics/"]
    )
    opcua_client.client.get_node = MagicMock(return_value=namespace_node)
    opcua_client.client.connect = AsyncMock()
    opcua_client.client.nodes.root = FakeNode("i=84", "Root")
    
    opcua_client.node_manager.browse_objects = AsyncMock()
    opcua_client.resolve_goto_method = AsyncMock(return_value="ns=2;i=100")
    opcua_client.resolve_toggle_endeff_method = AsyncMock(return_value="ns=2;i=101")
    opcua_client.send_robot_info_to_frontend = AsyncMock()
    
    with patch.object(opcua_client, 'has_robotics_namespace', return_value=True):
        with patch('asyncio.create_task', side_effect=_create_task_and_close):
            await opcua_client.connect()
    
    assert opcua_client.running is True
    opcua_client.resolve_goto_method.assert_called_once()
    opcua_client.resolve_toggle_endeff_method.assert_called_once()
    opcua_client.send_robot_info_to_frontend.assert_called_once()


@pytest.mark.asyncio
async def test_disconnect(opcua_client):
    """Test disconnection from OPC UA server."""
    opcua_client.running = True
    opcua_client.client.disconnect = AsyncMock()
    opcua_client.subscription_manager.subscription = MagicMock()
    opcua_client.subscription_manager.subscription.delete = AsyncMock()
    
    await opcua_client.disconnect()
    
    assert opcua_client.running is False
    opcua_client.subscription_manager.subscription.delete.assert_called_once()
    opcua_client.client.disconnect.assert_called_once()


# --- Robotics Namespace Tests ---

@pytest.mark.asyncio
async def test_has_robotics_namespace_true(opcua_client):
    """Test robotics namespace detection returns True."""
    namespace_node = FakeNode(
        "i=2255",
        "NamespaceArray",
        value=["http://opcfoundation.org/UA/", "http://opcfoundation.org/UA/Robotics/"]
    )
    opcua_client.client.get_node = MagicMock(return_value=namespace_node)
    
    result = await opcua_client.has_robotics_namespace()
    
    assert result is True
    assert opcua_client.is_robotics_server is True


@pytest.mark.asyncio
async def test_has_robotics_namespace_false(opcua_client):
    """Test robotics namespace detection returns False."""
    namespace_node = FakeNode(
        "i=2255",
        "NamespaceArray",
        value=["http://opcfoundation.org/UA/"]
    )
    opcua_client.client.get_node = MagicMock(return_value=namespace_node)
    
    result = await opcua_client.has_robotics_namespace()
    
    assert result is False
    assert opcua_client.is_robotics_server is False


@pytest.mark.asyncio
async def test_has_robotics_namespace_error(opcua_client):
    """Test robotics namespace detection handles errors."""
    opcua_client.client.get_node = MagicMock(side_effect=Exception("Connection error"))
    
    result = await opcua_client.has_robotics_namespace()
    
    assert result is False
    assert opcua_client.is_robotics_server is False


# --- Read Robot Info Tests ---

@pytest.mark.asyncio
async def test_read_manufacturer_success(opcua_client):
    """Test reading manufacturer from robotics server."""
    opcua_client.is_robotics_server = True
    device_set = FakeNode("ns=2;i=1", "DeviceSet")
    manufacturer_node = FakeNode("ns=2;i=100", "Manufacturer", value=SimpleNamespace(Text="ACME Robotics"))
    
    opcua_client.node_manager.find_child_by_name = AsyncMock(return_value=device_set)
    opcua_client.node_manager.find_descendant_by_name = AsyncMock(return_value=manufacturer_node)
    
    result = await opcua_client.read_manufacturer()
    
    assert result == "ACME Robotics"


@pytest.mark.asyncio
async def test_read_manufacturer_not_robotics_server(opcua_client):
    """Test reading manufacturer when not a robotics server."""
    opcua_client.is_robotics_server = False
    
    result = await opcua_client.read_manufacturer()
    
    assert result == "Not a robotics server"


@pytest.mark.asyncio
async def test_read_manufacturer_no_device_set(opcua_client):
    """Test reading manufacturer when DeviceSet is not found."""
    opcua_client.is_robotics_server = True
    opcua_client.node_manager.find_child_by_name = AsyncMock(return_value=None)
    
    result = await opcua_client.read_manufacturer()
    
    assert result == "None"


@pytest.mark.asyncio
async def test_read_model_success(opcua_client):
    """Test reading model from robotics server."""
    opcua_client.is_robotics_server = True
    device_set = FakeNode("ns=2;i=1", "DeviceSet")
    model_node = FakeNode("ns=2;i=101", "Model", value=SimpleNamespace(Text="RoboArm 3000"))
    
    opcua_client.node_manager.find_child_by_name = AsyncMock(return_value=device_set)
    opcua_client.node_manager.find_descendant_by_name = AsyncMock(return_value=model_node)
    
    result = await opcua_client.read_model()
    
    assert result == "RoboArm 3000"


@pytest.mark.asyncio
async def test_read_serial_number_success(opcua_client):
    """Test reading serial number from robotics server."""
    opcua_client.is_robotics_server = True
    device_set = FakeNode("ns=2;i=1", "DeviceSet")
    serial_node = FakeNode("ns=2;i=102", "SerialNumber", value=SimpleNamespace(Text="SN123456"))
    
    opcua_client.node_manager.find_child_by_name = AsyncMock(return_value=device_set)
    opcua_client.node_manager.find_descendant_by_name = AsyncMock(return_value=serial_node)
    
    result = await opcua_client.read_serial_number()
    
    assert result == "SN123456"


# --- Send Robot Info Tests ---

@pytest.mark.asyncio
async def test_send_robot_info_to_frontend(opcua_client, mock_websocket):
    """Test sending robot info to frontend via WebSocket."""
    opcua_client.websocket = mock_websocket
    opcua_client.goto_method_nodeid = "ns=2;i=100"
    opcua_client.toggle_endeff_method_nodeid = "ns=2;i=101"
    
    opcua_client.read_manufacturer = AsyncMock(return_value="ACME")
    opcua_client.read_model = AsyncMock(return_value="RoboArm")
    opcua_client.read_serial_number = AsyncMock(return_value="SN123")
    
    await opcua_client.send_robot_info_to_frontend()
    
    mock_websocket.send_text.assert_called_once()
    call_args = mock_websocket.send_text.call_args[0][0]
    assert call_args.startswith("opc.tcp://localhost:4840|x|robotinfo:")
    assert "ACME" in call_args
    assert "RoboArm" in call_args
    assert "SN123" in call_args


@pytest.mark.asyncio
async def test_send_robot_info_websocket_disconnected(opcua_client, mock_websocket):
    """Test sending robot info when WebSocket is disconnected."""
    mock_websocket.client_state = WebSocketState.DISCONNECTED
    opcua_client.websocket = mock_websocket
    
    opcua_client.read_manufacturer = AsyncMock(return_value="ACME")
    opcua_client.read_model = AsyncMock(return_value="RoboArm")
    opcua_client.read_serial_number = AsyncMock(return_value="SN123")
    
    await opcua_client.send_robot_info_to_frontend()
    
    mock_websocket.send_text.assert_not_called()


# --- Method Resolution Tests ---

@pytest.mark.asyncio
async def test_resolve_goto_method_success(opcua_client):
    """Test resolving goto method."""
    goto_node = FakeNode("ns=2;i=200", "JointPTPMoveSkill")
    opcua_client.node_manager.find_method_by_names = AsyncMock(return_value=goto_node)
    
    result = await opcua_client.resolve_goto_method()
    
    assert result == "ns=2;i=200"
    assert opcua_client.goto_method_nodeid == "ns=2;i=200"


@pytest.mark.asyncio
async def test_resolve_goto_method_not_found(opcua_client):
    """Test resolving goto method when not found."""
    opcua_client.node_manager.find_method_by_names = AsyncMock(return_value=None)
    
    result = await opcua_client.resolve_goto_method()
    
    assert result is None
    assert opcua_client.goto_method_nodeid is None


@pytest.mark.asyncio
async def test_resolve_toggle_endeff_method_success(opcua_client):
    """Test resolving toggle end effector method."""
    toggle_node = FakeNode("ns=2;i=201", "EndEffSkill")
    opcua_client.node_manager.find_method_by_names = AsyncMock(return_value=toggle_node)
    
    result = await opcua_client.resolve_toggle_endeff_method()
    
    assert result == "ns=2;i=201"
    assert opcua_client.toggle_endeff_method_nodeid == "ns=2;i=201"


@pytest.mark.asyncio
async def test_resolve_toggle_endeff_method_not_found(opcua_client):
    """Test resolving toggle end effector method when not found."""
    opcua_client.node_manager.find_method_by_names = AsyncMock(return_value=None)
    
    result = await opcua_client.resolve_toggle_endeff_method()
    
    assert result is None
    assert opcua_client.toggle_endeff_method_nodeid is None


# --- Method Call Tests ---

@pytest.mark.asyncio
async def test_call_method_success(opcua_client):
    """Test successful method call."""
    method_node = FakeNode("ns=2;i=300", "TestMethod")
    parent_node = FakeNode("ns=2;i=301", "ParentNode")
    method_node._parent = parent_node
    
    # Mock input arguments
    input_arg_node = FakeNode("ns=0;i=1", "InputArguments", value=[
        SimpleNamespace(
            Name="param1",
            DataType=SimpleNamespace(Identifier=VariantType.Int32.value),
            ValueRank=0
        )
    ])
    method_node._children = [input_arg_node]
    
    opcua_client.client.get_node = MagicMock(return_value=method_node)
    
    result = await opcua_client.call_method("ns=2;i=300", {"param1": "42"})
    
    assert result is not None


@pytest.mark.asyncio
async def test_call_method_with_string_argument(opcua_client):
    """Test method call with string argument."""
    method_node = FakeNode("ns=2;i=300", "TestMethod")
    parent_node = FakeNode("ns=2;i=301", "ParentNode")
    method_node._parent = parent_node
    
    input_arg_node = FakeNode("ns=0;i=1", "InputArguments", value=[
        SimpleNamespace(
            Name="message",
            DataType=SimpleNamespace(Identifier=VariantType.String.value),
            ValueRank=0
        )
    ])
    method_node._children = [input_arg_node]
    
    opcua_client.client.get_node = MagicMock(return_value=method_node)
    
    result = await opcua_client.call_method("ns=2;i=300", {"message": "Hello"})
    
    assert result is not None


@pytest.mark.asyncio
async def test_call_method_with_error(opcua_client):
    """Test method call handles errors."""
    opcua_client.client.get_node = MagicMock(side_effect=Exception("Method not found"))
    
    result = await opcua_client.call_method("ns=2;i=999", {})
    
    assert result["error"] is not None
    assert "Method not found" in result["error"]


# --- Run Loop Test ---

@pytest.mark.asyncio
async def test_run_loop(opcua_client):
    """Test run loop executes while running is True."""
    opcua_client.running = True
    
    # Run loop for a short time then stop
    async def stop_after_delay():
        await asyncio.sleep(0.1)
        opcua_client.running = False
    
    import asyncio
    await asyncio.gather(
        opcua_client.run_loop(),
        stop_after_delay()
    )
    
    assert opcua_client.running is False
