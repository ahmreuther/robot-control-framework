from backend.models.opcua import AxisBinding, MethodBinding, MotionDeviceBinding
from backend.models.robot import RobotOpcUaInterface, RobotSessionInfo, make_robot_id


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
