import os

import pytest

from backend.opcua.asyncua_discovery import (
    AXIS_TYPE_IDENTIFIER,
    MOTION_DEVICE_TYPE_IDENTIFIER,
    ROBOTICS_NAMESPACE_URI,
    discover_server,
    namespace_index,
    read_robot_joint_state,
    typed_node_id,
)


def test_typed_node_id_uses_server_namespace_array_index() -> None:
    namespace_uris = [
        "http://opcfoundation.org/UA/",
        "urn:example",
        ROBOTICS_NAMESPACE_URI,
    ]

    assert namespace_index(namespace_uris, ROBOTICS_NAMESPACE_URI) == 2
    assert typed_node_id(namespace_uris, ROBOTICS_NAMESPACE_URI, MOTION_DEVICE_TYPE_IDENTIFIER) == (
        "ns=2;i=1004"
    )
    assert typed_node_id(namespace_uris, ROBOTICS_NAMESPACE_URI, AXIS_TYPE_IDENTIFIER) == (
        "ns=2;i=16601"
    )


@pytest.mark.asyncio
async def test_demo_server_discovery_when_url_is_configured() -> None:
    server_url = os.getenv("WSC2_DEMO_OPCUA_URL")
    if not server_url:
        pytest.skip("Set WSC2_DEMO_OPCUA_URL to run demo-server integration discovery.")

    result = await discover_server(server_url)

    assert result.server.server_url == server_url
    assert result.server.is_robotics_server is True
    assert len(result.robots) >= 1

    robot = result.robots[0]
    assert robot.motion_device.node_id
    assert robot.display_name
    assert len(robot.opcua.axes) >= 1
    assert all(axis.actual_position_node_id for axis in robot.opcua.axes.values())
    assert all(method.node_id for method in robot.opcua.methods.values())

    joint_state = await read_robot_joint_state(server_url, robot.opcua)
    assert set(joint_state.axis_values) == set(robot.opcua.axes)
    assert all(value == 0.0 for value in joint_state.axis_values.values())
