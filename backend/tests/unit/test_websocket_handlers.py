import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from dt_robot_control.websocket import handlers
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


def add_client(url="opc.tcp://a", manager=None, **kwargs):
    mgr = manager or MagicMock()
    client = MagicMock(subscription_manager=mgr, **kwargs)
    client_registry.client_registry.add(url, client)
    return client, mgr


@pytest.fixture(autouse=True)
def clear_clients():
    client_registry.client_registry.clear()
    yield
    client_registry.client_registry.clear()


def test_get_client_helper():
    fake = object()
    client_registry.client_registry.add("opc.tcp://a", fake)
    assert handlers.get_client("opc.tcp://a") is fake




@pytest.mark.asyncio
async def test_handle_call_success_and_no_client():
    ws = FakeWebSocket([])
    fake_client = MagicMock()
    fake_client.call_method = AsyncMock(return_value="ok")
    client_registry.client_registry.add("opc.tcp://a", fake_client)
    await handlers.handle_call(ws, 'call|{"url":"opc.tcp://a","nodeId":"n1","inputs":{}}')
    assert ws.sent == ["opc.tcp://a|Method call result: ok"]

    # missing client path
    ws2 = FakeWebSocket([])
    await handlers.handle_call(ws2, 'call|{"url":"opc.tcp://missing","nodeId":"n1"}')
    assert ws2.sent == ["opc.tcp://missing|❌ No OPC UA client found for method call."]


@pytest.mark.asyncio
async def test_handle_subscribe_missing_fields_and_duplicate():
    ws = FakeWebSocket([])
    await handlers.handle_subscribe(ws, 'subscribe|{"url":"","nodeId":""}')
    assert ws.sent == ["Global|❌ subscribe: url and nodeId must be provided."]

    manager = MagicMock()
    manager.custom_subscriptions = {"n1": object()}
    fake_client = MagicMock(subscription_manager=manager)
    client_registry.client_registry.add("opc.tcp://a", fake_client)

    ws2 = FakeWebSocket([])
    await handlers.handle_subscribe(ws2, 'subscribe|{"url":"opc.tcp://a","nodeId":"n1"}')
    assert ws2.sent == ["opc.tcp://a|⚠️ Already subscribed to variable at n1 on opc.tcp://a"]


@pytest.mark.asyncio
async def test_handle_connect_existing_and_failure():
    ws = FakeWebSocket([])
    # existing
    client_registry.client_registry.add("opc.tcp://a", object())
    await handlers.handle_connect(ws, "connect|opc.tcp://a")
    assert ws.sent == ["opc.tcp://a|⚠️ Already connected to opc.tcp://a"]

    # failure path
    ws2 = FakeWebSocket([])
    with patch("dt_robot_control.websocket.handlers.OPCUAClient", side_effect=Exception("boom")):
        await handlers.handle_connect(ws2, "connect|opc.tcp://fail")
    assert ws2.sent == ["opc.tcp://fail|❌ Connection failed to opc.tcp://fail: boom"]




@pytest.mark.parametrize(
    "fn,message,setup,expected",
    [
        (handlers.handle_subscribe_event, 'subscribeEvent|{"url":"missing","nodeId":"n"}', lambda: None, "No OPC UA client found"),
        (handlers.handle_subscribe_event, 'subscribeEvent|{"url":"opc.tcp://a","nodeId":"n"}', lambda: add_client(manager=MagicMock(subscribe_events_on_node=AsyncMock(return_value=True))), "✅ Subscribed"),
        (handlers.handle_subscribe_event, 'subscribeEvent|{"url":"opc.tcp://a","nodeId":"n"}', lambda: add_client(manager=MagicMock(subscribe_events_on_node=AsyncMock(return_value=False))), "❌ Failed to subscribe"),
        (handlers.handle_subscribe_event, "subscribeEvent|{bad", lambda: None, "Global|❌ Event subscription error"),
        (handlers.handle_unsubscribe_event, 'unsubscribeEvent|{"url":"missing"}', lambda: None, "No OPC UA client found"),
        (handlers.handle_unsubscribe_event, 'unsubscribeEvent|{"url":"opc.tcp://a"}', lambda: add_client(manager=MagicMock(unsubscribe_events=AsyncMock(return_value=True))), "✅ Event subscription removed"),
        (handlers.handle_unsubscribe_event, 'unsubscribeEvent|{"url":"opc.tcp://a"}', lambda: add_client(manager=MagicMock(unsubscribe_events=AsyncMock(return_value=False))), "⚠️ No active event subscription"),
        (handlers.handle_unsubscribe_event, "unsubscribeEvent|{bad", lambda: None, "Global|❌ Unsubscribe event error"),
    ],
)
@pytest.mark.asyncio
async def test_event_handlers_param(fn, message, setup, expected):
    ws = FakeWebSocket([])
    setup()
    await fn(ws, message)
    assert any(expected in msg for msg in ws.sent)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "message,setup,expected_fragment",
    [
        ('subscribeEvent|{"url":"opc.tcp://a","nodeId":"node"}', lambda: add_client(manager=MagicMock(subscribe_events_on_node=AsyncMock(return_value=True))), "✅ Subscribed"),
        ('subscribeEvent|{"url":"opc.tcp://a","nodeId":"node"}', lambda: add_client(manager=MagicMock(subscribe_events_on_node=AsyncMock(return_value=False))), "❌ Failed to subscribe"),
        ('subscribeEvent|{"url":"missing","nodeId":"node"}', lambda: None, "No OPC UA client found"),
        ('unsubscribeEvent|{"url":"opc.tcp://a"}', lambda: add_client(manager=MagicMock(unsubscribe_events=AsyncMock(return_value=True))), "✅ Event subscription removed"),
        ('unsubscribeEvent|{"url":"opc.tcp://a"}', lambda: add_client(manager=MagicMock(unsubscribe_events=AsyncMock(return_value=False))), "⚠️ No active event subscription"),
        ('unsubscribeEvent|{"url":"missing"}', lambda: None, "No OPC UA client found"),
    ],
)
async def test_event_handlers_compact(message, setup, expected_fragment):
    ws = FakeWebSocket([])
    setup()
    if message.startswith("subscribeEvent"):
        await handlers.handle_subscribe_event(ws, message)
    else:
        await handlers.handle_unsubscribe_event(ws, message)
    assert any(expected_fragment in msg for msg in ws.sent)


@pytest.mark.asyncio
async def test_handle_connect_success_and_robots_flag(monkeypatch):
    ws = FakeWebSocket([])
    fake_client = MagicMock()
    fake_client.is_robotics_server = True
    fake_client.connect = AsyncMock()
    fake_client.has_robotics_namespace = AsyncMock()
    fake_client.subscription_manager = MagicMock()
    monkeypatch.setattr(handlers, "OPCUAClient", MagicMock(return_value=fake_client))

    with patch("dt_robot_control.websocket.handlers.try_read_model", AsyncMock(return_value="model")):
        with patch("dt_robot_control.websocket.handlers.try_read_serialnumber", AsyncMock(return_value="serial")):
            await handlers.handle_connect(ws, "connect|opc.tcp://ok")
    assert any("Connected" in msg for msg in ws.sent)
    assert any("Model: model" in msg for msg in ws.sent)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "stream_fn,cancel_fn,connect_url,manager_kwargs,expected_prefix",
    [
        (handlers.handle_stream_joint_position, handlers.handle_cancel_stream_joint_position, "opc.tcp://a", {"subscribe_axes_actual_positions": AsyncMock(), "stop_axes_subscription": AsyncMock()}, "Streaming joint positions"),
        (handlers.handle_stream_mode, handlers.handle_cancel_stream_mode, "opc.tcp://a", {"subscribe_mode": AsyncMock(), "stop_mode_subscription": AsyncMock()}, "Streaming Mode"),
    ],
)
async def test_stream_and_cancel_compact(stream_fn, cancel_fn, connect_url, manager_kwargs, expected_prefix):
    ws = FakeWebSocket([])
    mgr = MagicMock(**manager_kwargs)
    client_registry.client_registry.add(connect_url, MagicMock(subscription_manager=mgr))

    await stream_fn(ws, f"stream|{connect_url}")
    await cancel_fn(ws, f"cancel|{connect_url}")

    assert ws.sent[0].startswith(f"{connect_url}|{expected_prefix}")
    assert "cancelled" in ws.sent[1]

    ws_missing = FakeWebSocket([])
    await stream_fn(ws_missing, f"stream|{connect_url}missing")
    await cancel_fn(ws_missing, f"cancel|{connect_url}missing")
    assert all("No OPC UA client" in msg for msg in ws_missing.sent)


@pytest.mark.asyncio
async def test_handle_status_and_disconnect(monkeypatch):
    ws = FakeWebSocket([])
    # status with no clients
    await handlers.handle_status(ws)
    assert ws.sent == ["Global|System Ready"]

    # status with one client
    client = MagicMock()
    client.is_robotics_server = False
    client_subscription = MagicMock(stop_axes_subscription=AsyncMock(), stop_mode_subscription=AsyncMock(), custom_subscriptions={})
    client.subscription_manager = client_subscription
    client.disconnect = AsyncMock()
    client.websocket = ws
    client_registry.client_registry.add("opc.tcp://a", client)
    with patch("dt_robot_control.websocket.handlers.try_read_model", AsyncMock(return_value="m")):
        with patch("dt_robot_control.websocket.handlers.try_read_serialnumber", AsyncMock(return_value="s")):
            await handlers.handle_status(ws)
    assert any("Connected" in msg for msg in ws.sent)

    # disconnect success and missing
    await handlers.handle_disconnect(ws, "disconnect|opc.tcp://a")
    await handlers.handle_disconnect(ws, "disconnect|opc.tcp://missing")
    assert any("Disconnected" in msg for msg in ws.sent)




@pytest.mark.asyncio
async def test_handle_call_error_and_subscribe_no_client():
    ws = FakeWebSocket([])
    await handlers.handle_call(ws, "call|{notjson")
    assert ws.sent[-1].startswith("Global|❌ Error parsing call payload")

    ws2 = FakeWebSocket([])
    await handlers.handle_subscribe(ws2, 'subscribe|{"url":"opc.tcp://missing","nodeId":"x"}')
    assert ws2.sent[-1].endswith("No OPC UA client connected for URL: opc.tcp://missing")


@pytest.mark.asyncio
async def test_handle_subscribe_event_and_unsubscribe_errors():
    ws = FakeWebSocket([])
    await handlers.handle_subscribe_event(ws, "subscribeEvent|{bad")
    await handlers.handle_unsubscribe_event(ws, "unsubscribeEvent|{bad")
    assert ws.sent[0].startswith("Global|❌ Event subscription error")
    assert ws.sent[1].startswith("Global|❌ Unsubscribe event error")


@pytest.mark.asyncio
async def test_handle_connect_not_robotics(monkeypatch):
    ws = FakeWebSocket([])
    fake_client = MagicMock()
    fake_client.is_robotics_server = False
    fake_client.connect = AsyncMock()
    fake_client.has_robotics_namespace = AsyncMock()
    monkeypatch.setattr(handlers, "OPCUAClient", MagicMock(return_value=fake_client))
    await handlers.handle_connect(ws, "connect|opc.tcp://no_robot")
    assert any("Robotics Namespace" in msg for msg in ws.sent)


@pytest.mark.asyncio
async def test_handle_status_error_path(monkeypatch):
    ws = FakeWebSocket([])
    bad_client = MagicMock()
    bad_client.subscription_manager = MagicMock()
    bad_client.websocket = ws
    bad_client.disconnect = AsyncMock()
    async def boom(*args, **kwargs):
        raise RuntimeError("fail")
    monkeypatch.setattr(handlers, "try_read_model", AsyncMock(side_effect=boom))
    client_registry.client_registry.add("opc.tcp://err", bad_client)
    await handlers.handle_status(ws)
    assert any("Status check failed" in msg for msg in ws.sent)


@pytest.mark.asyncio
async def test_stream_and_cancel_no_client():
    ws = FakeWebSocket([])
    await handlers.handle_stream_joint_position(ws, "stream joint position|opc.tcp://none")
    await handlers.handle_cancel_stream_joint_position(ws, "cancel stream joint position|opc.tcp://none")
    assert ws.sent == [
        "opc.tcp://none|❌ No OPC UA client found for opc.tcp://none",
        "opc.tcp://none|❌ No OPC UA client found for opc.tcp://none",
    ]


@pytest.mark.asyncio
async def test_try_read_helpers_and_robustness():
    client = MagicMock()
    client.is_robotics_server = False
    # Non-robotics short-circuits to None
    assert await handlers.try_read_model(client) is None
    assert await handlers.try_read_serialnumber(client) is None

    client.is_robotics_server = True
    client.read_model = AsyncMock(side_effect=RuntimeError("fail"))
    client.read_serial_number = AsyncMock(return_value="sn")

    msg = await handlers.try_read_model(client)
    assert "Model read error" in msg
    assert await handlers.try_read_serialnumber(client) == "sn"

    client.read_serial_number = AsyncMock(side_effect=RuntimeError("boom"))
    serial_msg = await handlers.try_read_serialnumber(client)
    assert "SerialNumber read error" in serial_msg


@pytest.mark.asyncio
async def test_handle_subscribe_success_and_error_path(monkeypatch):
    ws = FakeWebSocket([])
    mgr = MagicMock()
    mgr.custom_subscriptions = {}
    mgr.subscribe_custom = AsyncMock()
    client_registry.client_registry.add("opc.tcp://ok", MagicMock(subscription_manager=mgr))
    await handlers.handle_subscribe(ws, 'subscribe|{"url":"opc.tcp://ok","nodeId":"n1"}')
    assert ws.sent[-1] == "opc.tcp://ok|✅ Subscribed to variable at n1 on opc.tcp://ok"
    mgr.subscribe_custom.assert_awaited_once_with("n1", ws)

    ws_error = FakeWebSocket([])
    mgr_error = MagicMock()
    mgr_error.custom_subscriptions = {}
    mgr_error.subscribe_custom = AsyncMock(side_effect=RuntimeError("boom"))
    client_registry.client_registry.add("opc.tcp://err", MagicMock(subscription_manager=mgr_error))
    await handlers.handle_subscribe(ws_error, 'subscribe|{"url":"opc.tcp://err","nodeId":"n2"}')
    assert ws_error.sent[-1].startswith("Global|❌ subscribe error")


@pytest.mark.asyncio
async def test_handle_unsubscribe_paths():
    ws = FakeWebSocket([])
    mgr = MagicMock()
    mgr.custom_subscriptions = {"n1": object()}
    mgr.unsubscribe_custom = AsyncMock(return_value=True)
    client_registry.client_registry.add("opc.tcp://a", MagicMock(subscription_manager=mgr))
    await handlers.handle_unsubscribe(ws, 'unsubscribe|{"url":"opc.tcp://a","nodeId":"n1"}')
    assert "unsubscribe:{" in ws.sent[0]
    assert ws.sent[1].endswith("✅ Unsubscribed from variable at n1 on opc.tcp://a")

    ws_fail = FakeWebSocket([])
    mgr.unsubscribe_custom.return_value = False
    await handlers.handle_unsubscribe(ws_fail, 'unsubscribe|{"url":"opc.tcp://a","nodeId":"missing"}')
    assert ws_fail.sent[-1] == "opc.tcp://a|❌ No subscription found for missing on opc.tcp://a"

    ws_missing = FakeWebSocket([])
    await handlers.handle_unsubscribe(ws_missing, 'unsubscribe|{"url":"opc.tcp://missing","nodeId":"n1"}')
    assert ws_missing.sent[-1] == "opc.tcp://missing|❌ No subscription found for n1 on opc.tcp://missing"

    ws_bad = FakeWebSocket([])
    await handlers.handle_unsubscribe(ws_bad, "unsubscribe|{bad")
    assert ws_bad.sent[-1].startswith("Global|❌ unsubscribe error")


@pytest.mark.asyncio
async def test_handle_disconnect_cleans_custom_subscriptions():
    ws = FakeWebSocket([])
    mgr = MagicMock()
    mgr.stop_axes_subscription = AsyncMock()
    mgr.stop_mode_subscription = AsyncMock()
    mgr.unsubscribe_custom = AsyncMock(return_value=True)
    mgr.custom_subscriptions = {"a": object(), "b": object()}
    client = MagicMock(subscription_manager=mgr)
    client.disconnect = AsyncMock()
    client_registry.client_registry.add("opc.tcp://disc", client)

    await handlers.handle_disconnect(ws, "disconnect|opc.tcp://disc")

    mgr.stop_axes_subscription.assert_awaited_once()
    mgr.stop_mode_subscription.assert_awaited_once()
    assert mgr.unsubscribe_custom.await_count == 2
    client.disconnect.assert_awaited_once()
    assert not client_registry.client_registry.has("opc.tcp://disc")
    assert ws.sent[-1] == "opc.tcp://disc|🔌 Disconnected from opc.tcp://disc"
