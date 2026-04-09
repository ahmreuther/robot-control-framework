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


def test_clear_terminal_executes():
    from dt_robot_control.opcua.opcua_client import clear_terminal
    # Should not raise
    clear_terminal()


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


def make_arg(name, identifier, value_rank=0):
    """Small helper to build an InputArgument-like object."""
    return SimpleNamespace(
        Name=name,
        Description=None,
        DataType=SimpleNamespace(Identifier=identifier),
        ValueRank=value_rank,
    )


def make_method(args, result=None, method_id="m", parent_id="p"):
    """Wire up a method node with provided input args and optional call result."""
    method_node = FakeNode(method_id, "Method")
    parent_node = FakeNode(parent_id, "Parent")
    method_node._parent = parent_node
    input_arg_node = FakeNode("i", "InputArguments", value=args)
    method_node._children = [input_arg_node]
    method_node.get_child = AsyncMock(return_value=input_arg_node)
    default_result = SimpleNamespace(StatusCode="Good")
    parent_node.call_method = AsyncMock(return_value=result if result is not None else default_result)
    return method_node, parent_node


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
async def test_connect_resolution_errors(opcua_client):
    namespace_node = FakeNode(
        "i=2255",
        "NamespaceArray",
        value=["http://opcfoundation.org/UA/", "http://opcfoundation.org/UA/Robotics/"]
    )
    opcua_client.client.get_node = MagicMock(return_value=namespace_node)
    opcua_client.client.connect = AsyncMock()
    opcua_client.client.nodes.root = FakeNode("i=84", "Root")
    opcua_client.node_manager.browse_objects = AsyncMock()
    opcua_client.resolve_goto_method = AsyncMock(side_effect=Exception("goto_fail"))
    opcua_client.resolve_toggle_endeff_method = AsyncMock(side_effect=Exception("toggle_fail"))
    opcua_client.send_robot_info_to_frontend = AsyncMock()

    with patch.object(opcua_client, 'has_robotics_namespace', return_value=True):
        with patch('asyncio.create_task', side_effect=_create_task_and_close):
            await opcua_client.connect()

    opcua_client.resolve_goto_method.assert_awaited_once()
    opcua_client.resolve_toggle_endeff_method.assert_awaited_once()
    opcua_client.send_robot_info_to_frontend.assert_awaited_once()


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
@pytest.mark.parametrize(
    "fn_name,node_name,expected",
    [
        ("read_manufacturer", "Manufacturer", "ACME Robotics"),
        ("read_model", "Model", "RoboArm 3000"),
        ("read_serial_number", "SerialNumber", "SN123456"),
    ],
)
async def test_read_device_attribute_success(opcua_client, fn_name, node_name, expected):
    opcua_client.is_robotics_server = True
    device_set = FakeNode("ns=2;i=1", "DeviceSet")
    value_node = FakeNode(f"ns=2;i={node_name}", node_name, value=SimpleNamespace(Text=expected))

    opcua_client.node_manager.find_child_by_name = AsyncMock(return_value=device_set)
    opcua_client.node_manager.find_descendant_by_name = AsyncMock(return_value=value_node)

    fn = getattr(opcua_client, fn_name)
    result = await fn()

    assert result == expected


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
async def test_read_manufacturer_node_missing(opcua_client):
    """Test manufacturer path when DeviceSet exists but node is absent."""
    opcua_client.is_robotics_server = True
    device_set = FakeNode("ns=2;i=1", "DeviceSet")
    opcua_client.node_manager.find_child_by_name = AsyncMock(return_value=device_set)
    opcua_client.node_manager.find_descendant_by_name = AsyncMock(return_value=None)

    result = await opcua_client.read_manufacturer()

    assert result == "None"


# --- Send Robot Info Tests ---

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "ws_state,expect_send",
    [
        (WebSocketState.CONNECTED, True),
        (WebSocketState.DISCONNECTED, False),
    ],
)
async def test_send_robot_info_to_frontend(opcua_client, mock_websocket, ws_state, expect_send):
    opcua_client.websocket = mock_websocket
    mock_websocket.client_state = ws_state
    opcua_client.goto_method_nodeid = "ns=2;i=100"
    opcua_client.toggle_endeff_method_nodeid = "ns=2;i=101"

    opcua_client.read_manufacturer = AsyncMock(return_value="ACME")
    opcua_client.read_model = AsyncMock(return_value="RoboArm")
    opcua_client.read_serial_number = AsyncMock(return_value="SN123")

    await opcua_client.send_robot_info_to_frontend()

    if expect_send:
        mock_websocket.send_text.assert_called_once()
        call_args = mock_websocket.send_text.call_args[0][0]
        assert call_args.startswith("opc.tcp://localhost:4840|x|robotinfo:")
        assert "ACME" in call_args and "RoboArm" in call_args and "SN123" in call_args
    else:
        mock_websocket.send_text.assert_not_called()


@pytest.mark.asyncio
async def test_send_robot_info_exception(opcua_client, mock_websocket):
    mock_websocket.client_state = WebSocketState.CONNECTED
    opcua_client.websocket = mock_websocket
    opcua_client.url = "opc"
    opcua_client.read_manufacturer = AsyncMock(side_effect=Exception("boom"))
    await opcua_client.send_robot_info_to_frontend()  # swallow exception


@pytest.mark.asyncio
async def test_has_robotics_namespace_error(opcua_client):
    opcua_client.client.get_node = MagicMock(side_effect=Exception("fail"))
    res = await opcua_client.has_robotics_namespace()
    assert res is False and opcua_client.is_robotics_server is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "fn_name,error_prefix",
    [
        ("read_model", "❌ Model read error:"),
        ("read_serial_number", "❌ SerialNumber read error:"),
        ("read_manufacturer", "❌ Manufacturer read error:"),
    ],
)
async def test_read_details_error_paths(opcua_client, fn_name, error_prefix):
    opcua_client.is_robotics_server = True
    opcua_client.node_manager.find_child_by_name = AsyncMock(side_effect=Exception("boom"))
    fn = getattr(opcua_client, fn_name)
    res = await fn()
    assert res.startswith(error_prefix)


@pytest.mark.asyncio
async def test_read_model_serial_manufacturer_not_robotics(opcua_client):
    opcua_client.is_robotics_server = False
    assert await opcua_client.read_model() == "Not a robotics server"
    assert await opcua_client.read_serial_number() == "Not a robotics server"
    assert await opcua_client.read_manufacturer() == "Not a robotics server"


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
    method_node, parent_node = make_method([make_arg("param1", VariantType.Int32.value)], method_id="ns=2;i=300", parent_id="ns=2;i=301")
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    result = await opcua_client.call_method("ns=2;i=300", {"param1": "42"})

    assert result is not None


@pytest.mark.asyncio
async def test_call_method_with_string_argument(opcua_client):
    """Test method call with string argument."""
    method_node, _ = make_method([make_arg("message", VariantType.String.value)], method_id="ns=2;i=300", parent_id="ns=2;i=301")
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


@pytest.mark.asyncio
async def test_call_method_parent_exception(opcua_client):
    method_node, parent_node = make_method([])
    parent_node.call_method = AsyncMock(side_effect=RuntimeError("boom"))
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    res = await opcua_client.call_method("m", {})
    assert res["error"].startswith("Error when calling method:boom")


@pytest.mark.asyncio
async def test_call_method_value_error_inputs(opcua_client):
    args = [make_arg("count", 9999)]  # invalid VariantType to force ValueError
    result_obj = SimpleNamespace(StatusCode="Good", OutputArguments=["ok"])
    method_node, parent_node = make_method(args, result=result_obj)
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    res = await opcua_client.call_method("m", {"count": "123"})
    parent_node.call_method.assert_called_once_with(method_node)
    assert res is result_obj


@pytest.mark.asyncio
async def test_call_method_input_parsing_and_none(opcua_client):
    args = [
        make_arg("flag", VariantType.Boolean.value),
        make_arg("num", VariantType.Float.value),
        make_arg("cnt", VariantType.Int16.value),
        make_arg("blob", VariantType.ByteString.value),
        make_arg("arr", VariantType.String.value, value_rank=1),
        make_arg("empty", VariantType.String.value),
    ]
    result_obj = SimpleNamespace(StatusCode=None, OutputArguments=None, Value="ok")
    method_node, parent_node = make_method(args, result=result_obj)
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    res = await opcua_client.call_method(
        "m",
        {
            "flag": "true",
            "num": "1.5",
            "cnt": "2",
            "blob": "hi",
            "arr": "[\"a\"]",
            "empty": "",
        },
    )
    assert res is result_obj


@pytest.mark.asyncio
async def test_call_method_outputargs_attr_only(opcua_client):
    class Result:
        def __init__(self):
            self.OutputArguments = []
            self.StatusCode = "Good"

    method_node, parent_node = make_method([make_arg("p", VariantType.Int32.value)], result=Result())
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    res = await opcua_client.call_method("m", {"p": "1"})
    assert isinstance(res, Result)


@pytest.mark.asyncio
async def test_call_method_outputargs_tuple_converted(opcua_client, monkeypatch):
    with patch("asyncua.common.ua_utils.val_to_string", return_value="done") as mocked:
        result_obj = SimpleNamespace(StatusCode="Good", OutputArguments=("a",))
        method_node, parent_node = make_method([make_arg("p", VariantType.Int32.value)], result=result_obj)
        opcua_client.client.get_node = MagicMock(return_value=method_node)

        res = await opcua_client.call_method("m", {"p": "1"})

    assert mocked.call_count == 1  # status block iterates tuple
    assert res is result_obj


@pytest.mark.asyncio
async def test_call_method_outputargs_scalar_converted(opcua_client):
    with patch("asyncua.common.ua_utils.val_to_string", return_value="converted") as mocked:
        result_obj = SimpleNamespace(StatusCode="Good", OutputArguments="scalar")
        method_node, parent_node = make_method([make_arg("p", VariantType.Int32.value)], result=result_obj)
        opcua_client.client.get_node = MagicMock(return_value=method_node)

        res = await opcua_client.call_method("m", {"p": "1"})

    assert mocked.call_count == len("scalar")
    assert res is result_obj


@pytest.mark.asyncio
async def test_call_method_result_none_status_branch(opcua_client):
    method_node, parent_node = make_method([], result=None)
    parent_node.call_method = AsyncMock(return_value=None)
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    res = await opcua_client.call_method("m", {})
    assert res is None


@pytest.mark.asyncio
async def test_call_method_val_to_string_exception(opcua_client, monkeypatch):
    class Result:
        def __init__(self):
            self.OutputArguments = []  # falsy to skip first output branch
        @property
        def StatusCode(self):
            raise RuntimeError("vt")

    method_node, parent_node = make_method([make_arg("p", VariantType.Int32.value)], result=Result())
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    res = await opcua_client.call_method("m", {"p": "1"})
    assert isinstance(res, Result)


@pytest.mark.asyncio
async def test_call_method_array_value_error_other_type(opcua_client):
    result_obj = SimpleNamespace(StatusCode="Good")
    method_node, parent_node = make_method([make_arg("arr", VariantType.Guid.value, value_rank=1)], result=result_obj)
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    res = await opcua_client.call_method("m", {"arr": "not-json"})
    parent_node.call_method.assert_called_once_with(method_node)
    assert res is result_obj


@pytest.mark.asyncio
async def test_call_method_guid_json_input_parses(opcua_client):
    result_obj = SimpleNamespace(StatusCode="Good")
    method_node, parent_node = make_method([make_arg("guid", VariantType.Guid.value)], result=result_obj)
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    res = await opcua_client.call_method("m", {"guid": "123"})
    parent_node.call_method.assert_called_once_with(method_node, 123)
    assert res is result_obj


@pytest.mark.asyncio
async def test_call_method_string_array_value_rank(opcua_client):
    result_obj = SimpleNamespace(StatusCode="Good")
    method_node, parent_node = make_method([make_arg("arr", VariantType.String.value, value_rank=1)], result=result_obj)
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    res = await opcua_client.call_method("m", {"arr": "[1,2]"})
    parent_node.call_method.assert_called_once_with(method_node, "[1,2]")
    assert res is result_obj


@pytest.mark.asyncio
async def test_call_method_various_types(opcua_client):
    args = [
        make_arg("flag", VariantType.Boolean.value),
        make_arg("nums", VariantType.Float.value, value_rank=1),
        make_arg("count", VariantType.Int32.value),
        make_arg("list", VariantType.String.value, value_rank=1),
        make_arg("empty", VariantType.String.value),
    ]
    result_obj = SimpleNamespace(StatusCode="Good", OutputArguments=[SimpleNamespace()])
    method_node, parent_node = make_method(args, result=result_obj, method_id="ns=2;i=400", parent_id="ns=2;i=401")
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    await opcua_client.call_method(
        "ns=2;i=400",
        {
            "flag": "yes",
            "nums": "[1,2]",
            "count": "5",
            "list": "[\"a\"]",
            "empty": "",
        },
    )


@pytest.mark.asyncio
async def test_call_method_result_value_sets_output(opcua_client):
    result_obj = SimpleNamespace(Value=123)
    method_node, parent_node = make_method([make_arg("p", VariantType.Int32.value)], result=result_obj)
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    res = await opcua_client.call_method("m", {"p": "1"})
    assert res is result_obj


@pytest.mark.asyncio
async def test_call_method_result_name_empty_uses_str(opcua_client):
    class Result:
        def __init__(self):
            self.Name = ""  # falsy to drive fallback branch

    result_obj = Result()
    method_node, parent_node = make_method([make_arg("p", VariantType.Int32.value)], result=result_obj)
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    res = await opcua_client.call_method("m", {"p": "1"})
    assert res is result_obj


@pytest.mark.asyncio
async def test_call_method_result_attr_exception_fallback(opcua_client):
    class Boom:
        def __getattr__(self, item):
            if item in ("Name", "Value"):
                raise RuntimeError("boom")
            raise AttributeError()

    result_obj = Boom()
    method_node, parent_node = make_method([make_arg("p", VariantType.Int32.value)], result=result_obj)
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    res = await opcua_client.call_method("m", {"p": "1"})
    assert res is result_obj


@pytest.mark.asyncio
async def test_call_method_outputargs_secondary_attr_access(opcua_client, monkeypatch):
    class Flaky:
        def __init__(self):
            self.count = 0

        def __getattr__(self, item):
            if item == "OutputArguments":
                self.count += 1
                if self.count == 1:
                    raise AttributeError()
                return ["x"]
            raise AttributeError()

    result_obj = Flaky()
    method_node, parent_node = make_method([make_arg("p", VariantType.Int32.value)], result=result_obj)
    opcua_client.client.get_node = MagicMock(return_value=method_node)

    with patch("asyncua.common.ua_utils.val_to_string", return_value="done") as mocked:
        res = await opcua_client.call_method("m", {"p": "1"})

    assert mocked.called
    assert res is result_obj


    @pytest.mark.asyncio
    async def test_call_method_status_and_output(opcua_client):
        class Arg:
            def __init__(self):
                self.Name = "p"
                self.Description = None
                self.DataType = SimpleNamespace(Identifier=VariantType.Int32.value)
                self.ValueRank = 0

        method_node = FakeNode("m", "Method")
        parent_node = FakeNode("p", "Parent")
        method_node._parent = parent_node
        input_arg_node = FakeNode("i", "InputArguments", value=[Arg()])
        method_node._children = [input_arg_node]
        method_node.get_child = AsyncMock(return_value=input_arg_node)
        result_obj = SimpleNamespace(StatusCode="Good", OutputArguments=[SimpleNamespace()])
        parent_node.call_method = AsyncMock(return_value=result_obj)
        opcua_client.client.get_node = MagicMock(return_value=method_node)
        res = await opcua_client.call_method("m", {"p": "1"})
        assert res is result_obj


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


@pytest.mark.asyncio
async def test_read_model_and_serial_missing_nodes(opcua_client):
    opcua_client.is_robotics_server = True
    # device_set missing
    opcua_client.node_manager.find_child_by_name = AsyncMock(return_value=None)
    assert await opcua_client.read_model() == "None"
    assert await opcua_client.read_serial_number() == "None"

    # device_set present but target node missing
    device_set = FakeNode("ds")
    opcua_client.node_manager.find_child_by_name = AsyncMock(return_value=device_set)
    opcua_client.node_manager.find_descendant_by_name = AsyncMock(return_value=None)
    assert await opcua_client.read_model() == "None"
    assert await opcua_client.read_serial_number() == "None"