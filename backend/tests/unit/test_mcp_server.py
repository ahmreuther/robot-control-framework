import pytest
from unittest.mock import AsyncMock

from dt_robot_control.server import mcp


class FakeWebSocket:
    def __init__(self, messages):
        self._messages = messages
        self.sent = []
        self.accept = AsyncMock()

    async def receive_text(self):
        if not self._messages:
            from fastapi import WebSocketDisconnect
            raise WebSocketDisconnect()
        return self._messages.pop(0)

    async def send_text(self, text):
        self.sent.append(text)


@pytest.fixture(autouse=True)
def clear_state():
    mcp.websockets.clear()
    yield
    mcp.websockets.clear()


@pytest.mark.asyncio
async def test_websocket_endpoint_tracks_values_and_cleans_up():
    ws = FakeWebSocket([
        "TCP|Pos:1, 2, 3;Rot:0.1, 0.2, 0.3, 0.4",
        "ANGLES|J1: 10,J2: 20",
    ])
    await mcp.websocket_endpoint(ws)
    # globals updated
    assert mcp.tool_center_point == ["1", "2", "3"]
    assert mcp.tool_center_point_rot == ["0.1", "0.2", "0.3", "0.4"]
    assert mcp.angles == ["10", "20"]


def test_tools_use_latest_globals():
    mcp.tool_center_point = ["1", "2", "3"]
    mcp.tool_center_point_rot = ["0.1", "0.2", "0.3", "0.4"]
    mcp.angles = ["5", "6"]

    assert "X=1m" in mcp.get_tcp.fn(ctx=None)
    assert "0.1" in mcp.get_tcp_rotation.fn()
    assert "Joint 1=5" in mcp.get_joint_angles.fn()


@pytest.mark.asyncio
async def test_setters_broadcast():
    ws = FakeWebSocket([])
    mcp.websockets.add(ws)
    await mcp.set_joint_angles.fn(joint_angles=[1, 2], ctx=None)
    await mcp.set_tcp_pos.fn(x=1, y=2, z=3, ctx=None)
    # two sends happened
    assert ws.sent[0].startswith("JOINTS|")
    assert ws.sent[1] == "TCP_POS|1,2,3"
    mcp.websockets.clear()
