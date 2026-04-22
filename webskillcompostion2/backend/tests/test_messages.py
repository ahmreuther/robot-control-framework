import pytest
from pydantic import ValidationError

from wsc2_backend.models.messages import (
    RobotJointStateEvent,
    parse_client_message_json,
    parse_server_message_json,
)


def test_robot_command_requires_robot_id() -> None:
    with pytest.raises(ValidationError):
        parse_client_message_json(
            '{"type":"subscribeRobotJoints","requestId":"req-1"}',
        )


def test_client_message_accepts_camel_case_json() -> None:
    msg = parse_client_message_json(
        '{"type":"callRobotMethod","requestId":"req-1","robotId":"robot-1",'
        '"method":"goto","inputs":{"joints":[0,1,2]}}',
    )

    assert msg.type == "callRobotMethod"
    assert msg.request_id == "req-1"
    assert msg.robot_id == "robot-1"


def test_robot_joint_event_round_trips_with_robot_id() -> None:
    event = RobotJointStateEvent(
        type="robotJointState",
        server_url="opc.tcp://127.0.0.1:4840",
        robot_id="robot-1",
        data={"axis_values": {"Axis1": 1.25}, "unit": "rad"},
    )

    raw = event.model_dump_json(by_alias=True)
    parsed = parse_server_message_json(raw)

    assert parsed.type == "robotJointState"
    assert parsed.robot_id == "robot-1"
    assert parsed.data.axis_values == {"Axis1": 1.25}

