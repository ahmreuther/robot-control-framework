from __future__ import annotations

import asyncio

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from backend.models.messages import ServerMessage, parse_client_message_json
from backend.runtime.application_service import error_event, handle_client_message
from backend.services.runtime_registry import RuntimeRegistry


async def send_event(websocket: WebSocket, event: ServerMessage) -> None:
    await websocket.send_text(event.model_dump_json(by_alias=True))


def get_registry(websocket: WebSocket) -> RuntimeRegistry:
    registry = getattr(websocket.app.state, "registry", None)
    if isinstance(registry, RuntimeRegistry):
        return registry

    registry = RuntimeRegistry()
    websocket.app.state.registry = registry
    return registry


async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    registry = get_registry(websocket)
    send_lock = asyncio.Lock()
    defer_live_events = False
    deferred_live_events: list[ServerMessage] = []

    async def emit_event(event: ServerMessage) -> None:
        if defer_live_events:
            deferred_live_events.append(event)
            return

        async with send_lock:
            await send_event(websocket, event)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = parse_client_message_json(raw)
            except ValidationError as exc:
                await emit_event(
                    error_event(
                        message=f"Invalid client message: {exc}",
                        code="invalidMessage",
                    )
                )
                continue

            defer_live_events = True
            try:
                events = await handle_client_message(
                    message,
                    registry=registry,
                    emit_event=emit_event,
                )
            finally:
                defer_live_events = False

            for event in events:
                await emit_event(event)
            for event in deferred_live_events:
                await emit_event(event)
            deferred_live_events.clear()
    except WebSocketDisconnect:
        return
