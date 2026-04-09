import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from dt_robot_control.websocket import router, handlers
from dt_robot_control.services import client_registry


class FakeWebSocket:
    def __init__(self, messages):
        self._messages = messages
        self.sent = []
        self.accept = AsyncMock()
        self.client_state = MagicMock()

    async def receive_text(self):
        if not self._messages:
            raise RuntimeError("no more messages")
        return self._messages.pop(0)

    async def send_text(self, text):
        self.sent.append(text)


@pytest.fixture(autouse=True)
def clear_clients():
    client_registry.client_registry.clear()
    yield
    client_registry.client_registry.clear()


@pytest.mark.asyncio
async def test_router_dispatches_and_handles_unknown():
    ws = FakeWebSocket(["status", "unknown|cmd"])
    with patch.object(handlers, "handle_status", AsyncMock()) as status:
        await router.websocket_endpoint(ws)
    status.assert_awaited_once()
    assert "Global|❓ Unknown command: unknown|cmd" in ws.sent


@pytest.mark.asyncio
async def test_router_cleanup_on_exception():
    class BoomWebSocket(FakeWebSocket):
        async def receive_text(self):
            raise RuntimeError("boom")

    ws = BoomWebSocket([])
    fake_client = MagicMock(websocket=ws)
    fake_client.disconnect = AsyncMock()
    client_registry.client_registry.add("opc.tcp://a", fake_client)

    await router.websocket_endpoint(ws)
    assert not client_registry.client_registry.has("opc.tcp://a")


@pytest.mark.asyncio
async def test_router_dispatches_known_prefix():
    ws = FakeWebSocket(["call|{}"])
    handle_call = AsyncMock()
    with patch.dict(router.MESSAGE_HANDLERS, {"call|": handle_call}):
        await router.websocket_endpoint(ws)
    handle_call.assert_awaited_once_with(ws, "call|{}")
