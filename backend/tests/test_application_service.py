import pytest

from backend.models.messages import (
    AddressSpaceChildrenEvent,
    AddressSpaceNodeDetailsEvent,
    AddressSpaceReferencesEvent,
    AddressSpaceRootEvent,
    ErrorEvent,
    MethodResultEvent,
    RobotsDiscoveredEvent,
    ServerConnectedEvent,
    parse_client_message_json,
    parse_server_message_json,
)
from backend.models.opcua import AxisBinding, MethodBinding, MotionDeviceBinding, NodeBinding, SkillBinding
from backend.models.robot import (
    RobotActionBinding,
    RobotJointState,
    RobotOpcUaInterface,
    RobotSessionInfo,
)
from backend.models.server import ServerSessionInfo, ServerStatus
from backend.opcua.discovery import ServerDiscoveryResult
from backend.opcua.method_calls import normalize_method_inputs
from backend.runtime.application_service import (
    _extract_skill_current_state_text,
    _map_skill_current_state_to_status,
    handle_client_message,
)
from backend.services.runtime_registry import RuntimeRegistry


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
                ),
                "create_new_session": MethodBinding(
                    nodeId=f"{node_id}.CreateSession",
                    displayName="Create Session",
                    inputArguments=[],
                    outputArguments=[],
                ),
            },
            skills={
                "go_to": SkillBinding(
                    nodeId=f"{node_id}.GoToSkill",
                    displayName="Go To Skill",
                    parameterSetNodeId=f"{node_id}.GoToSkill.ParameterSet",
                    resultSetNodeId=f"{node_id}.GoToSkill.ResultSet",
                    currentStateNodeId=f"{node_id}.GoToSkill.CurrentState",
                    startNodeId=f"{node_id}.GoToSkill.Start",
                    haltNodeId=f"{node_id}.GoToSkill.Halt",
                    resetNodeId=f"{node_id}.GoToSkill.Reset",
                    parameters={
                        "mode": NodeBinding(nodeId=f"{node_id}.GoToSkill.ParameterSet.Mode"),
                        "joints": NodeBinding(nodeId=f"{node_id}.GoToSkill.ParameterSet.Joints"),
                    },
                    results={},
                ),
            },
            axes={
                "Axis1": AxisBinding(
                    axisName="Axis1",
                    axisNodeId=f"{node_id}.Axis1",
                    actualPositionNodeId=f"{node_id}.Axis1.ActualPosition",
                )
            },
        ),
        actions={
            "goto": RobotActionBinding(
                kind="skill",
                targetName="go_to",
                skillNodeId=f"{node_id}.GoToSkill",
                parameterSetNodeId=f"{node_id}.GoToSkill.ParameterSet",
                resultSetNodeId=f"{node_id}.GoToSkill.ResultSet",
                currentStateNodeId=f"{node_id}.GoToSkill.CurrentState",
                startNodeId=f"{node_id}.GoToSkill.Start",
                haltNodeId=f"{node_id}.GoToSkill.Halt",
                resetNodeId=f"{node_id}.GoToSkill.Reset",
                parameterNames=["mode", "joints"],
                resultNames=[],
            ),
            "createSession": RobotActionBinding(
                kind="method",
                targetName="create_new_session",
                methodNodeId=f"{node_id}.CreateSession",
                parameterNames=[],
                resultNames=[],
            ),
        },
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
            motionDeviceIds=[robot.robot_id for robot in robots],
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
        self.node_values: dict[str, object] = {
            "ns=4;s=MotionDevice_1.GoToSkill.CurrentState": "Ready",
            "ns=4;s=MotionDevice_2.GoToSkill.CurrentState": "Ready",
        }
        self.written_node_values: dict[str, object] = {}
        self.browse_root_count = 0
        self.browse_children_calls: list[str] = []
        self.browse_references_calls: list[str] = []
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
        if method_node_id.endswith(".GoToSkill.Start"):
            self.node_values[method_node_id.replace(".Start", ".CurrentState")] = "Running"
        elif method_node_id.endswith(".GoToSkill.Halt"):
            self.node_values[method_node_id.replace(".Halt", ".CurrentState")] = "Halted"
        elif method_node_id.endswith(".GoToSkill.Reset"):
            self.node_values[method_node_id.replace(".Reset", ".CurrentState")] = "Ready"
        return {
            "methodNodeId": method_node_id,
            "inputs": inputs,
            "args": args,
            "output": None,
            "status": "ok",
        }

    async def read_node_value(self, node_id: str):
        return self.node_values.get(node_id)

    async def write_node_value(self, node_id: str, value: object) -> None:
        self.written_node_values[node_id] = value

    async def browse_address_space_root(self):
        self.browse_root_count += 1
        return [
            {
                "nodeId": "i=84",
                "displayName": "Root",
                "browseName": "Root",
                "nodeClass": "Object",
                "hasChildren": True,
            }
        ]

    async def browse_address_space_children(self, node_id: str):
        self.browse_children_calls.append(node_id)
        return [
            {
                "nodeId": f"{node_id}.child",
                "displayName": "Child Node",
                "browseName": "ChildNode",
                "nodeClass": "Variable",
                "hasChildren": False,
            }
        ]

    async def browse_address_space_references(self, node_id: str):
        self.browse_references_calls.append(node_id)
        return [
            {
                "referenceType": "Organizes (i=35)",
                "nodeId": "i=86",
                "browseName": "0:Types",
                "typeDefinition": "FolderType (i=61)",
            }
        ]

    async def browse_address_space_node_details(self, node_id: str):
        return {
            "nodeId": node_id,
            "browseName": "0:Root",
            "displayName": "Root",
            "nodeClass": "Object",
            "nodeClassValue": 1,
            "description": "Top level root",
            "value": None,
            "dataType": None,
            "eventNotifier": "0",
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
    assert FakeConnection.created[0].connected is True
    assert FakeConnection.created[0].discovery_count == 0
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
async def test_discover_command_reuses_cached_result_after_disconnect() -> None:
    registry = RuntimeRegistry()
    discover_command = parse_client_message_json(
        '{"type":"discoverRobots","requestId":"req-discover-1","serverUrl":"' + SERVER_URL + '"}'
    )

    first_events = await handle_client_message(
        discover_command,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert len(first_events) == 1
    assert isinstance(first_events[0], RobotsDiscoveredEvent)
    assert len(FakeConnection.created) == 1
    assert FakeConnection.created[0].discovery_count == 1

    disconnect_command = parse_client_message_json(
        '{"type":"disconnectServer","requestId":"req-disconnect","serverUrl":"' + SERVER_URL + '"}'
    )
    await handle_client_message(
        disconnect_command,
        registry=registry,
        connection_factory=FakeConnection,
    )

    second_events = await handle_client_message(
        parse_client_message_json(
            '{"type":"discoverRobots","requestId":"req-discover-2","serverUrl":"' + SERVER_URL + '"}'
        ),
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert len(second_events) == 1
    assert isinstance(second_events[0], RobotsDiscoveredEvent)
    assert len(FakeConnection.created) == 1
    assert FakeConnection.created[0].discovery_count == 1


@pytest.mark.asyncio
async def test_browse_address_space_root_returns_nodes() -> None:
    registry = RuntimeRegistry()
    command = parse_client_message_json(
        '{"type":"browseAddressSpaceRoot","requestId":"req-root","serverUrl":"' + SERVER_URL + '"}'
    )

    events = await handle_client_message(
        command,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert len(events) == 1
    assert isinstance(events[0], AddressSpaceRootEvent)
    assert events[0].nodes[0].display_name == "Root"
    assert FakeConnection.created[0].browse_root_count == 1


@pytest.mark.asyncio
async def test_browse_address_space_children_returns_nodes() -> None:
    registry = RuntimeRegistry()
    command = parse_client_message_json(
        '{"type":"browseAddressSpaceChildren","requestId":"req-children","serverUrl":"'
        + SERVER_URL
        + '","nodeId":"i=85"}'
    )

    events = await handle_client_message(
        command,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert len(events) == 1
    assert isinstance(events[0], AddressSpaceChildrenEvent)
    assert events[0].node_id == "i=85"
    assert events[0].nodes[0].display_name == "Child Node"
    assert FakeConnection.created[0].browse_children_calls == ["i=85"]


@pytest.mark.asyncio
async def test_browse_address_space_references_returns_references() -> None:
    registry = RuntimeRegistry()
    command = parse_client_message_json(
        '{"type":"browseAddressSpaceReferences","requestId":"req-references","serverUrl":"'
        + SERVER_URL
        + '","nodeId":"i=85"}'
    )

    events = await handle_client_message(
        command,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert len(events) == 1
    assert isinstance(events[0], AddressSpaceReferencesEvent)
    assert events[0].node_id == "i=85"
    assert events[0].references[0].reference_type == "Organizes (i=35)"
    assert FakeConnection.created[0].browse_references_calls == ["i=85"]


@pytest.mark.asyncio
async def test_browse_address_space_node_details_returns_details() -> None:
    registry = RuntimeRegistry()
    command = parse_client_message_json(
        '{"type":"browseAddressSpaceNodeDetails","requestId":"req-node-details","serverUrl":"'
        + SERVER_URL
        + '","nodeId":"i=84"}'
    )

    events = await handle_client_message(
        command,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert len(events) == 1
    assert isinstance(events[0], AddressSpaceNodeDetailsEvent)
    assert events[0].node_id == "i=84"
    assert events[0].details.description == "Top level root"
    assert events[0].details.node_class_value == 1


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
async def test_execute_robot_action_dispatches_skill_and_emits_runtime_state() -> None:
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

    command = parse_client_message_json(
        '{"type":"executeRobotAction","requestId":"req-action","robotId":"'
        + robot_id
        + '","actionName":"goto","inputs":{"mode":"automatic","joints":[0,1,2]}}'
    )
    events = await handle_client_message(
        command,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert events[0].type == "methodResult"
    assert events[1].type == "robotActionState"
    assert events[1].data.action_name == "goto"
    assert events[1].data.kind == "skill"
    assert events[1].data.status == "running"
    assert events[1].data.current_state == "Running"
    assert FakeConnection.created[0].written_node_values == {
        "ns=4;s=MotionDevice_1.GoToSkill.ParameterSet.Mode": "automatic",
        "ns=4;s=MotionDevice_1.GoToSkill.ParameterSet.Joints": [0, 1, 2],
    }
    assert FakeConnection.created[0].raw_method_calls[-1] == {
        "methodNodeId": "ns=4;s=MotionDevice_1.GoToSkill.Start",
        "inputs": {"args": []},
        "args": [],
    }


def test_skill_current_state_normalization_accepts_structured_values() -> None:
    current_state = _extract_skill_current_state_text(
        {"Text": "Ready", "Locale": None}
    )

    assert current_state == "Ready"
    assert _map_skill_current_state_to_status(current_state) == "idle"
    assert (
        _map_skill_current_state_to_status("LocalizedText(Text='Running', Locale=None)")
        == "running"
    )


@pytest.mark.asyncio
async def test_halt_robot_action_dispatches_skill_transition() -> None:
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

    command = parse_client_message_json(
        '{"type":"haltRobotAction","requestId":"req-halt","robotId":"'
        + robot_id
        + '","actionName":"goto"}'
    )
    events = await handle_client_message(
        command,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert events[0].type == "methodResult"
    assert events[1].type == "robotActionState"
    assert events[1].data.status == "halted"
    assert events[1].data.current_state == "Halted"
    assert FakeConnection.created[0].raw_method_calls[-1]["methodNodeId"] == (
        "ns=4;s=MotionDevice_1.GoToSkill.Halt"
    )


@pytest.mark.asyncio
async def test_reset_robot_action_dispatches_skill_transition() -> None:
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

    command = parse_client_message_json(
        '{"type":"resetRobotAction","requestId":"req-reset","robotId":"'
        + robot_id
        + '","actionName":"goto"}'
    )
    events = await handle_client_message(
        command,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert events[0].type == "methodResult"
    assert events[1].type == "robotActionState"
    assert events[1].data.status == "reset"
    assert events[1].data.current_state == "Ready"
    assert FakeConnection.created[0].raw_method_calls[-1]["methodNodeId"] == (
        "ns=4;s=MotionDevice_1.GoToSkill.Reset"
    )


@pytest.mark.asyncio
async def test_execute_robot_action_dispatches_method_actions_too() -> None:
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

    command = parse_client_message_json(
        '{"type":"executeRobotAction","requestId":"req-action","robotId":"'
        + robot_id
        + '","actionName":"createSession","inputs":{"args":[]}}'
    )
    events = await handle_client_message(
        command,
        registry=registry,
        connection_factory=FakeConnection,
    )

    assert events[0].type == "methodResult"
    assert events[1].type == "robotActionState"
    assert events[1].data.kind == "method"
    assert events[1].data.status == "succeeded"
    assert FakeConnection.created[0].method_calls[-1]["method"] == "create_new_session"


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
