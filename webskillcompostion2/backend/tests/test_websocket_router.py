import os

import pytest
from fastapi.testclient import TestClient

from wsc2_backend.app import create_app
from wsc2_backend.models.opcua import MotionDeviceBinding
from wsc2_backend.models.robot import RobotSessionInfo
from wsc2_backend.opcua.discovery import ServerDiscoveryResult
from wsc2_backend.models.server import ServerSessionInfo, ServerStatus
from wsc2_backend.runtime import application_service


SERVER_URL = "opc.tcp://demo:4840"


async def fake_discover_server(server_url: str) -> ServerDiscoveryResult:
    robot = RobotSessionInfo.from_motion_device(
        server_url=server_url,
        motion_device=MotionDeviceBinding(nodeId="ns=4;s=MotionDevice_1", displayName="Robot 1"),
    )
    return ServerDiscoveryResult(
        server=ServerSessionInfo(
            serverUrl=server_url,
            status=ServerStatus.CONNECTED,
            namespaceUris=["http://opcfoundation.org/UA/"],
            isRoboticsServer=True,
            robotIds=[robot.robot_id],
        ),
        robots=[robot],
    )


class FakeConnection:
    def __init__(self, server_url: str) -> None:
        self.server_url = server_url

    async def connect(self) -> None:
        return None

    async def disconnect(self) -> None:
        return None

    async def discover(self) -> ServerDiscoveryResult:
        return await fake_discover_server(self.server_url)


def test_websocket_returns_error_for_invalid_message() -> None:
    app = create_app()

    with TestClient(app).websocket_connect("/ws") as websocket:
        websocket.send_text('{"type":"subscribeRobotJoints","requestId":"req-1"}')
        event = websocket.receive_json()

    assert event["type"] == "error"
    assert event["code"] == "invalidMessage"


def test_websocket_discovers_robots(monkeypatch) -> None:
    monkeypatch.setattr(application_service, "DEFAULT_CONNECTION_FACTORY", FakeConnection)
    app = create_app()

    with TestClient(app).websocket_connect("/ws") as websocket:
        websocket.send_json(
            {
                "type": "discoverRobots",
                "requestId": "req-1",
                "serverUrl": SERVER_URL,
            }
        )
        event = websocket.receive_json()

    assert event["type"] == "robotsDiscovered"
    assert event["requestId"] == "req-1"
    assert event["serverUrl"] == SERVER_URL
    assert len(event["robots"]) == 1


def test_websocket_demo_server_snapshot_when_url_is_configured() -> None:
    server_url = os.getenv("WSC2_DEMO_OPCUA_URL")
    if not server_url:
        pytest.skip("Set WSC2_DEMO_OPCUA_URL to run demo-server WebSocket integration.")

    app = create_app()

    with TestClient(app).websocket_connect("/ws") as websocket:
        websocket.send_json(
            {
                "type": "discoverRobots",
                "requestId": "req-discover",
                "serverUrl": server_url,
            }
        )
        discovered = websocket.receive_json()
        robot_id = discovered["robots"][0]["robotId"]

        websocket.send_json(
            {
                "type": "subscribeRobotJoints",
                "requestId": "req-subscribe",
                "robotId": robot_id,
            }
        )
        subscription_result = websocket.receive_json()
        joint_state = websocket.receive_json()

    assert discovered["type"] == "robotsDiscovered"
    assert len(discovered["robots"]) >= 1
    assert subscription_result["type"] == "methodResult"
    assert joint_state["type"] == "robotJointState"
    assert joint_state["robotId"] == robot_id
    assert len(joint_state["data"]["axisValues"]) >= 1
    assert all(value == 0.0 for value in joint_state["data"]["axisValues"].values())
