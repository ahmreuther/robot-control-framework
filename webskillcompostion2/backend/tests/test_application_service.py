import pytest

from wsc2_backend.models.messages import (
    ErrorEvent,
    MethodResultEvent,
    RobotsDiscoveredEvent,
    ServerConnectedEvent,
    parse_client_message_json,
    parse_server_message_json,
)
from wsc2_backend.models.opcua import AxisBinding, MethodBinding, MotionDeviceBinding
from wsc2_backend.models.robot import RobotJointState, RobotOpcUaInterface, RobotSessionInfo
from wsc2_backend.models.server import ServerSessionInfo, ServerStatus
from wsc2_backend.opcua.discovery import ServerDiscoveryResult
from wsc2_backend.opcua.method_calls import normalize_method_inputs
from wsc2_backend.runtime.application_service import handle_client_message
from wsc2_backend.services.runtime_registry import RuntimeRegistry


SERVER_URL = "opc.tcp://127.0.0.1:4840"


def fake_robot(
    *,
    server_url: str = SERVER_URL,
    node_id: str = "ns=4;s=MotionDevice_1",
    display_name: str = "Demo Robot 1",
) -> RobotSessionInfo:
    return RobotSessionInfo.from_motion_device(
        server_url=server_url,
        motion_device=MotionDeviceBinding(
            nodeId=node_id,
            displayName=display_name,
        ),
        opcua=RobotOpcUaInterface(
            methods={
                "goto": MethodBinding(
                    nodeId=f"{node_id}.JointPTPMoveSkill",
                    displayName="JointPTPMoveSkill",
                    inputArguments=[],
                    outputArguments=[],
                )
            },
            axes={
                "Axis1": AxisBinding(
                    axisName="Axis1",
                    axisNodeId=f"{node_id}.Axis1",
                    actualPositionNodeId=f"{node_id}.Axis1.ActualPosition",
                )
            },
        ),
    )


async def fake_discover(server_url: str) -> ServerDiscoveryResult:
    robots = [
        fake_robot(server_url=server_url),
        fake_robot(
            server_url=server_url,
            node_id="ns=4;s=MotionDevice_2",
            display_name="Demo Robot 2",
        ),
    ]
    return ServerDiscoveryResult(
        server=ServerSessionInfo(
            serverUrl=server_url,
            status=ServerStatus.CONNECTED,
            namespaceUris=["http://opcfoundation.org/UA/"],
            isRoboticsServer=True,
            robotIds=[robot.robot_id for robot in robots],
        ),
        robots=robots,
    )


class FakeConnection:
    created: list["FakeConnection"] = []

    def __init__(self, server_url: str) -> None:
        self.server_url = server_url
        self.connected = False
        self.disconnected = False
        self.discovery_count = 0
        self.read_count = 0
        self.method_calls: list[dict[str, object]] = []
        self.subscribed_robot_ids: list[str] = []
        self.unsubscribed_robot_ids: list[str] = []
        self.subscribed_nodes: list[str] = []
        self.unsubscribed_nodes: list[str] = []
        self.subscribed_events: list[str] = []
        self.unsubscribed_events: list[str] = []
        self.subscribed_modes: list[str] = []
        self.unsubscribed_modes: list[str] = []
        self.raw_method_calls: list[dict[str, object]] = []
        self.fail_method_call = False
        FakeConnection.created.append(self)

    async def connect(self) -> None:
        self.connected = True

    async def disconnect(self) -> None:
        self.disconnected = True
        self.connected = False

    async def discover(self) -> ServerDiscoveryResult:
        self.discovery_count += 1
        self.connected = True
        return await fake_discover(self.server_url)

    async def read_robot_joint_state(self, opcua: RobotOpcUaInterface) -> RobotJointState:
        self.read_count += 1
        return RobotJointState(axisValues={"Axis1": 0.0}, unit="rad")

    async def subscribe_robot_joints(
        self,
        *,
        robot_id: str,
        robot_opcua: RobotOpcUaInterface,
        on_state,
    ) -> None:
        self.subscribed_robot_ids.append(robot_id)
        await on_state(RobotJointState(axisValues={"Axis1": 1.0}, unit="rad"))

    async def unsubscribe_robot_joints(self, robot_id: str) -> None:
        self.unsubscribed_robot_ids.append(robot_id)

    async def subscribe_node(self, *, node_id: str, on_value) -> None:
        self.subscribed_nodes.append(node_id)
        await on_value(42)

    async def unsubscribe_node(self, node_id: str) -> None:
        self.unsubscribed_nodes.append(node_id)

    async def subscribe_events(self, *, node_id: str, on_event) -> None:
        self.subscribed_events.append(node_id)
        await on_event({"message": "demo event"})

    async def unsubscribe_events(self, node_id: str) -> None:
        self.unsubscribed_events.append(node_id)

    async def subscribe_robot_mode(self, *, robot_id: str, robot_opcua: RobotOpcUaInterface, on_mode) -> None:
        self.subscribed_modes.append(robot_id)
        await on_mode("automatic")

    async def unsubscribe_robot_mode(self, robot_id: str) -> None:
        self.unsubscribed_modes.append(robot_id)

    async def call_robot_method(
        self,
        *,
        motion_device_node_id: str,
        method_name: str,
        method_node_id: str,
        inputs: dict[str, object],
        input_arguments=None,
    ) -> dict[str, object]:
        if self.fail_method_call:
            raise RuntimeError("demo call failed")

        args = normalize_method_inputs(inputs)
        call = {
            "motionDeviceNodeId": motion_device_node_id,
            "method": method_name,
            "methodNodeId": method_node_id,
            "inputs": inputs,
            "args": args,
        }
        self.method_calls.append(call)
        return {
            "method": method_name,
            "inputs": inputs,
            "args": args,
            "output": None,
            "status": "ok",
        }

    async def call_raw_method(self, *, method_node_id: str, inputs: dict[str, object]) -> dict[str, object]:
        args = normalize_method_inputs(inputs)
        self.raw_method_calls.append({"methodNodeId": method_node_id, "inputs": inputs, "args": args})
        return {
            "methodNodeId": method_node_id,
            "inputs": inputs,
            "args": args,
            "output": None,
            "status": "ok",
        }


@pytest.fixture(autouse=True)
def clear_fake_connections() -> None:
    FakeConnection.created.clear()


@pytest.mark.asyncio
async def test_connect_command_returns_server_connected_event() -> None:
    registry = RuntimeRegistry()
    command = parse_client_message_json(
        '{"type":"connectServer","requestId":"req-connect","serverUrl":"' + SERVER_URL + '"}'
    )

    events = await handle_client_message(
        command,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert len(events) == 1
    assert isinstance(events[0], ServerConnectedEvent)
    assert events[0].server.server_url == SERVER_URL
    assert registry.get_server(SERVER_URL) is not None
    assert FakeConnection.created[0].discovery_count == 1
    parsed = parse_server_message_json(events[0].model_dump_json(by_alias=True))
    assert parsed.type == "serverConnected"


@pytest.mark.asyncio
async def test_discover_command_registers_multiple_robot_sessions() -> None:
    registry = RuntimeRegistry()
    command = parse_client_message_json(
        '{"type":"discoverRobots","requestId":"req-discover","serverUrl":"' + SERVER_URL + '"}'
    )

    events = await handle_client_message(
        command,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert len(events) == 1
    assert isinstance(events[0], RobotsDiscoveredEvent)
    assert [robot.display_name for robot in events[0].robots] == ["Demo Robot 1", "Demo Robot 2"]
    assert registry.get_robot(events[0].robots[0].robot_id) is not None
    assert registry.get_robot(events[0].robots[1].robot_id) is not None


@pytest.mark.asyncio
async def test_subscribe_robot_joints_routes_to_existing_robot_and_returns_snapshot() -> None:
    registry = RuntimeRegistry()
    discover = parse_client_message_json(
        '{"type":"discoverRobots","requestId":"req-discover","serverUrl":"' + SERVER_URL + '"}'
    )
    discovered = await handle_client_message(
        discover,
        registry=registry,
        connection_factory=FakeConnection,
    )
    robot_id = discovered[0].robots[0].robot_id

    subscribe = parse_client_message_json(
        '{"type":"subscribeRobotJoints","requestId":"req-sub","robotId":"' + robot_id + '"}'
    )
    events = await handle_client_message(
        subscribe,
        registry=registry,
        connection_factory=FakeConnection,
    )

    robot = registry.get_robot(robot_id)
    assert robot is not None
    assert robot.joints_subscription_active is True
    assert isinstance(events[0], MethodResultEvent)
    assert events[0].robot_id == robot_id
    assert events[0].result == {"subscription": "robotJoints", "active": True, "mode": "snapshot"}
    assert events[1].type == "robotJointState"
    assert events[1].data.axis_values == {"Axis1": 0.0}
    assert FakeConnection.created == [FakeConnection.created[0]]
    assert FakeConnection.created[0].read_count == 1


@pytest.mark.asyncio
async def test_subscribe_robot_joints_registers_live_subscription_when_emitter_exists() -> None:
    registry = RuntimeRegistry()
    emitted = []
    discover = parse_client_message_json(
        '{"type":"discoverRobots","requestId":"req-discover","serverUrl":"' + SERVER_URL + '"}'
    )
    discovered = await handle_client_message(
        discover,
        registry=registry,
        connection_factory=FakeConnection,
    )
    robot_id = discovered[0].robots[0].robot_id

    async def emit_event(event) -> None:
        emitted.append(event)

    subscribe = parse_client_message_json(
        '{"type":"subscribeRobotJoints","requestId":"req-sub","robotId":"' + robot_id + '"}'
    )
    await handle_client_message(
        subscribe,
        registry=registry,
        connection_factory=FakeConnection,
        emit_event=emit_event,
    )

    assert FakeConnection.created[0].subscribed_robot_ids == [robot_id]
    assert emitted[0].type == "robotJointState"
    assert emitted[0].data.axis_values == {"Axis1": 1.0}


@pytest.mark.asyncio
async def test_unsubscribe_robot_joints_removes_live_subscription() -> None:
    registry = RuntimeRegistry()
    discover = parse_client_message_json(
        '{"type":"discoverRobots","requestId":"req-discover","serverUrl":"' + SERVER_URL + '"}'
    )
    discovered = await handle_client_message(
        discover,
        registry=registry,
        connection_factory=FakeConnection,
    )
    robot_id = discovered[0].robots[0].robot_id

    unsubscribe = parse_client_message_json(
        '{"type":"unsubscribeRobotJoints","requestId":"req-unsub","robotId":"' + robot_id + '"}'
    )
    events = await handle_client_message(
        unsubscribe,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert events[0].type == "methodResult"
    assert FakeConnection.created[0].unsubscribed_robot_ids == [robot_id]


@pytest.mark.asyncio
async def test_call_robot_method_executes_on_existing_connection() -> None:
    registry = RuntimeRegistry()
    discover = parse_client_message_json(
        '{"type":"discoverRobots","requestId":"req-discover","serverUrl":"' + SERVER_URL + '"}'
    )
    discovered = await handle_client_message(
        discover,
        registry=registry,
        connection_factory=FakeConnection,
    )
    robot_id = discovered[0].robots[0].robot_id

    call = parse_client_message_json(
        '{"type":"callRobotMethod","requestId":"req-call","robotId":"'
        + robot_id
        + '","method":"goto","inputs":{"args":[[0,1,2]]}}'
    )
    events = await handle_client_message(
        call,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert isinstance(events[0], MethodResultEvent)
    assert events[0].robot_id == robot_id
    assert events[0].node_id == "ns=4;s=MotionDevice_1.JointPTPMoveSkill"
    assert events[0].result == {
        "method": "goto",
        "inputs": {"args": [[0, 1, 2]]},
        "args": [[0, 1, 2]],
        "output": None,
        "status": "ok",
    }
    assert FakeConnection.created[0].method_calls == [
        {
            "motionDeviceNodeId": "ns=4;s=MotionDevice_1",
            "method": "goto",
            "methodNodeId": "ns=4;s=MotionDevice_1.JointPTPMoveSkill",
            "inputs": {"args": [[0, 1, 2]]},
            "args": [[0, 1, 2]],
        }
    ]


@pytest.mark.asyncio
async def test_call_robot_method_rejects_unordered_inputs() -> None:
    registry = RuntimeRegistry()
    discover = parse_client_message_json(
        '{"type":"discoverRobots","requestId":"req-discover","serverUrl":"' + SERVER_URL + '"}'
    )
    discovered = await handle_client_message(
        discover,
        registry=registry,
        connection_factory=FakeConnection,
    )
    robot_id = discovered[0].robots[0].robot_id

    call = parse_client_message_json(
        '{"type":"callRobotMethod","requestId":"req-call","robotId":"'
        + robot_id
        + '","method":"goto","inputs":{"x":1,"y":2}}'
    )
    events = await handle_client_message(
        call,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert isinstance(events[0], ErrorEvent)
    assert events[0].code == "invalidMethodInputs"
    assert FakeConnection.created[0].method_calls == []


@pytest.mark.asyncio
async def test_call_robot_method_reports_connection_failure() -> None:
    registry = RuntimeRegistry()
    discover = parse_client_message_json(
        '{"type":"discoverRobots","requestId":"req-discover","serverUrl":"' + SERVER_URL + '"}'
    )
    discovered = await handle_client_message(
        discover,
        registry=registry,
        connection_factory=FakeConnection,
    )
    robot_id = discovered[0].robots[0].robot_id
    FakeConnection.created[0].fail_method_call = True

    call = parse_client_message_json(
        '{"type":"callRobotMethod","requestId":"req-call","robotId":"'
        + robot_id
        + '","method":"goto","inputs":{"args":[]}}'
    )
    events = await handle_client_message(
        call,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert isinstance(events[0], ErrorEvent)
    assert events[0].code == "methodCallFailed"


@pytest.mark.asyncio
async def test_subscribe_and_unsubscribe_node_routes_live_events() -> None:
    registry = RuntimeRegistry()
    emitted = []

    async def emit_event(event) -> None:
        emitted.append(event)

    subscribe = parse_client_message_json(
        '{"type":"subscribeNode","requestId":"req-sub-node","serverUrl":"'
        + SERVER_URL
        + '","nodeId":"ns=4;i=210"}'
    )
    events = await handle_client_message(
        subscribe,
        registry=registry,
        connection_factory=FakeConnection,
        emit_event=emit_event,
    )

    assert events[0].type == "methodResult"
    assert FakeConnection.created[0].subscribed_nodes == ["ns=4;i=210"]
    assert emitted[0].type == "nodeValueChanged"
    assert emitted[0].value == 42

    unsubscribe = parse_client_message_json(
        '{"type":"unsubscribeNode","requestId":"req-unsub-node","serverUrl":"'
        + SERVER_URL
        + '","nodeId":"ns=4;i=210"}'
    )
    await handle_client_message(unsubscribe, registry=registry, connection_factory=FakeConnection)

    assert FakeConnection.created[0].unsubscribed_nodes == ["ns=4;i=210"]


@pytest.mark.asyncio
async def test_subscribe_and_unsubscribe_events_routes_event_notifications() -> None:
    registry = RuntimeRegistry()
    emitted = []

    async def emit_event(event) -> None:
        emitted.append(event)

    subscribe = parse_client_message_json(
        '{"type":"subscribeEvent","requestId":"req-sub-event","serverUrl":"'
        + SERVER_URL
        + '","nodeId":"ns=4;i=56"}'
    )
    events = await handle_client_message(
        subscribe,
        registry=registry,
        connection_factory=FakeConnection,
        emit_event=emit_event,
    )

    assert events[0].type == "methodResult"
    assert FakeConnection.created[0].subscribed_events == ["ns=4;i=56"]
    assert emitted[0].type == "opcuaEvent"
    assert emitted[0].event == {"message": "demo event"}

    unsubscribe = parse_client_message_json(
        '{"type":"unsubscribeEvent","requestId":"req-unsub-event","serverUrl":"'
        + SERVER_URL
        + '","nodeId":"ns=4;i=56"}'
    )
    await handle_client_message(unsubscribe, registry=registry, connection_factory=FakeConnection)

    assert FakeConnection.created[0].unsubscribed_events == ["ns=4;i=56"]


@pytest.mark.asyncio
async def test_subscribe_and_unsubscribe_robot_mode_routes_mode_events() -> None:
    registry = RuntimeRegistry()
    emitted = []
    discover = parse_client_message_json(
        '{"type":"discoverRobots","requestId":"req-discover","serverUrl":"' + SERVER_URL + '"}'
    )
    discovered = await handle_client_message(
        discover,
        registry=registry,
        connection_factory=FakeConnection,
    )
    robot_id = discovered[0].robots[0].robot_id

    async def emit_event(event) -> None:
        emitted.append(event)

    subscribe = parse_client_message_json(
        '{"type":"subscribeRobotMode","requestId":"req-sub-mode","robotId":"' + robot_id + '"}'
    )
    events = await handle_client_message(
        subscribe,
        registry=registry,
        connection_factory=FakeConnection,
        emit_event=emit_event,
    )

    assert events[0].type == "methodResult"
    assert FakeConnection.created[0].subscribed_modes == [robot_id]
    assert emitted[0].type == "robotModeChanged"
    assert emitted[0].mode == "automatic"

    unsubscribe = parse_client_message_json(
        '{"type":"unsubscribeRobotMode","requestId":"req-unsub-mode","robotId":"' + robot_id + '"}'
    )
    await handle_client_message(unsubscribe, registry=registry, connection_factory=FakeConnection)

    assert FakeConnection.created[0].unsubscribed_modes == [robot_id]


@pytest.mark.asyncio
async def test_call_raw_method_routes_to_connection() -> None:
    registry = RuntimeRegistry()
    call = parse_client_message_json(
        '{"type":"callRawMethod","requestId":"req-raw","serverUrl":"'
        + SERVER_URL
        + '","nodeId":"ns=4;s=Method","inputs":{"args":[1,2]}}'
    )

    events = await handle_client_message(call, registry=registry, connection_factory=FakeConnection)

    assert events[0].type == "methodResult"
    assert events[0].node_id == "ns=4;s=Method"
    assert events[0].result == {
        "methodNodeId": "ns=4;s=Method",
        "inputs": {"args": [1, 2]},
        "args": [1, 2],
        "output": None,
        "status": "ok",
    }
    assert FakeConnection.created[0].raw_method_calls == [
        {"methodNodeId": "ns=4;s=Method", "inputs": {"args": [1, 2]}, "args": [1, 2]}
    ]


@pytest.mark.asyncio
async def test_disconnect_closes_persistent_connection_and_removes_robots() -> None:
    registry = RuntimeRegistry()
    discover = parse_client_message_json(
        '{"type":"discoverRobots","requestId":"req-discover","serverUrl":"' + SERVER_URL + '"}'
    )
    discovered = await handle_client_message(
        discover,
        registry=registry,
        connection_factory=FakeConnection,
    )
    robot_id = discovered[0].robots[0].robot_id
    connection = FakeConnection.created[0]

    disconnect = parse_client_message_json(
        '{"type":"disconnectServer","requestId":"req-disconnect","serverUrl":"' + SERVER_URL + '"}'
    )
    events = await handle_client_message(disconnect, registry=registry)

    assert events[0].type == "serverDisconnected"
    assert connection.disconnected is True
    assert registry.get_server(SERVER_URL) is None
    assert registry.get_robot(robot_id) is None


@pytest.mark.asyncio
async def test_unknown_robot_command_returns_error_event() -> None:
    registry = RuntimeRegistry()
    command = parse_client_message_json(
        '{"type":"subscribeRobotJoints","requestId":"req-sub","robotId":"missing"}'
    )

    events = await handle_client_message(command, registry=registry)

    assert isinstance(events[0], ErrorEvent)
    assert events[0].code == "robotNotFound"
    assert events[0].robot_id == "missing"
