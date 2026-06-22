from backend.models.opcua import AxisBinding, MethodBinding, MotionDeviceBinding, SkillBinding
from backend.models.robot import RobotOpcUaInterface, RobotSessionInfo, make_robot_id
from backend.opcua.discovery import build_robot_action_bindings


def test_robot_id_is_stable_for_server_and_motion_device() -> None:
    first = make_robot_id("opc.tcp://127.0.0.1:4840", "ns=4;s=MotionDevice_1")
    second = make_robot_id("opc.tcp://127.0.0.1:4840", "ns=4;s=MotionDevice_1")
    other = make_robot_id("opc.tcp://127.0.0.1:4840", "ns=4;s=MotionDevice_2")

    assert first == second
    assert first != other
    assert first.startswith("robot-")


def test_robot_session_is_motion_device_bound() -> None:
    motion_device = MotionDeviceBinding(
        nodeId="ns=4;s=MotionDevice_1",
        displayName="Robot 1",
        browseName="MotionDevice_1",
    )
    opcua = RobotOpcUaInterface(
        methods={
            "goto": MethodBinding(
                nodeId="ns=4;s=MotionDevice_1.JointPTPMoveSkill",
                inputArguments=[],
                outputArguments=[],
            )
        },
        axes={
            "Axis1": AxisBinding(
                axisName="Axis1",
                axisNodeId="ns=4;s=MotionDevice_1.Axis1",
                actualPositionNodeId="ns=4;s=MotionDevice_1.Axis1.ActualPosition",
            )
        },
    )

    robot = RobotSessionInfo.from_motion_device(
        server_url="opc.tcp://127.0.0.1:4840",
        motion_device=motion_device,
        opcua=opcua,
    )

    assert robot.motion_device.node_id == "ns=4;s=MotionDevice_1"
    assert robot.opcua.methods["goto"].node_id == "ns=4;s=MotionDevice_1.JointPTPMoveSkill"
    assert robot.opcua.axes["Axis1"].actual_position_node_id.endswith("ActualPosition")


def test_robot_actions_are_normalized_from_raw_bindings() -> None:
    opcua = RobotOpcUaInterface(
        methods={
            "create_new_session": MethodBinding(
                nodeId="ns=4;s=MotionDevice_1.create_new_session",
                displayName="create_new_session",
                inputArguments=[],
                outputArguments=[],
            ),
            "init_lock": MethodBinding(
                nodeId="ns=4;s=MotionDevice_1.init_lock",
                displayName="init_lock",
                inputArguments=[],
                outputArguments=[],
            ),
            "exit_lock": MethodBinding(
                nodeId="ns=4;s=MotionDevice_1.exit_lock",
                displayName="exit_lock",
                inputArguments=[],
                outputArguments=[],
            ),
            "custom_method": MethodBinding(
                nodeId="ns=4;s=MotionDevice_1.custom_method",
                displayName="custom_method",
                discoveryPath="Authentication/custom_method",
                inputArguments=[],
                outputArguments=[],
            )
        },
        skills={
            "go_to": SkillBinding(
                nodeId="ns=4;s=MotionDevice_1.go_to",
                displayName="go_to",
                parameterSetNodeId="ns=4;s=MotionDevice_1.go_to.ParameterSet",
                resultSetNodeId="ns=4;s=MotionDevice_1.go_to.ResultSet",
                currentStateNodeId="ns=4;s=MotionDevice_1.go_to.CurrentState",
                startNodeId="ns=4;s=MotionDevice_1.go_to.Start",
                parameters={"mode": {"nodeId": "ns=4;s=MotionDevice_1.go_to.ParameterSet.mode"}},
                results={"status": {"nodeId": "ns=4;s=MotionDevice_1.go_to.ResultSet.status"}},
            ),
            "custom_skill": SkillBinding(
                nodeId="ns=4;s=MotionDevice_1.custom_skill",
                displayName="custom_skill",
                discoveryPath="Skills/custom_skill",
                parameterSetNodeId="ns=4;s=MotionDevice_1.custom_skill.ParameterSet",
                resultSetNodeId="ns=4;s=MotionDevice_1.custom_skill.ResultSet",
                currentStateNodeId="ns=4;s=MotionDevice_1.custom_skill.CurrentState",
                startNodeId="ns=4;s=MotionDevice_1.custom_skill.Start",
                parameters={},
                results={},
            )
        },
    )

    actions = build_robot_action_bindings(opcua)

    assert actions["go_to"].kind == "skill"
    assert actions["go_to"].target_name == "go_to"
    assert actions["go_to"].start_node_id.endswith(".Start")
    assert actions["go_to"].parameter_names == ["mode"]
    assert actions["create_new_session"].kind == "method"
    assert actions["create_new_session"].target_name == "create_new_session"
    assert actions["init_lock"].kind == "method"
    assert actions["init_lock"].target_name == "init_lock"
    assert actions["exit_lock"].kind == "method"
    assert actions["exit_lock"].target_name == "exit_lock"
    assert actions["custom_method"].kind == "method"
    assert actions["custom_method"].target_name == "custom_method"
    assert actions["custom_method"].discovery_path == "Authentication/custom_method"
    assert actions["custom_skill"].kind == "skill"
    assert actions["custom_skill"].target_name == "custom_skill"
    assert actions["custom_skill"].discovery_path == "Skills/custom_skill"
