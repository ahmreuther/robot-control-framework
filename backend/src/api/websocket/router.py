"""WebSocket router for OPC UA.

Accepts websocket connections and forwards messages to handlers.
Prefer JSON messages: {"action":"...","payload":...}.
"""

from typing import Dict
from fastapi import APIRouter, WebSocket

from src.api.websocket import handlers
from src.opcua.opcua_client import OPCUAClient


router = APIRouter()
"""FastAPI router for websocket endpoints."""

clients: Dict[str, OPCUAClient] = {}
"""Shared mapping (url -> OPCUAClient). Injected into handlers via
`handlers.set_clients(clients)`. Replace with a `ClientRegistry` later."""

MESSAGE_HANDLERS = {
    "call|": handlers.handle_call,
    "subscribe|": handlers.handle_subscribe,
    "unsubscribe|": handlers.handle_unsubscribe,
    "subscribeEvent|": handlers.handle_subscribe_event,
    "unsubscribeEvent|": handlers.handle_unsubscribe_event,
    "connect|": handlers.handle_connect,
    "stream joint position|": handlers.handle_stream_joint_position,
    "cancel stream joint position|": handlers.handle_cancel_stream_joint_position,
    "stream mode|": handlers.handle_stream_mode,
    "cancel stream mode|": handlers.handle_cancel_stream_mode,
    "disconnect|": handlers.handle_disconnect,
}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Handle websocket connection and dispatch incoming messages."""
    await websocket.accept()
    print("WebSocket connected.")
    
    # Inject shared clients map into handlers so they operate on the
    # same registry (simple dependency injection).
    handlers.set_clients(clients)
    
    try:
        while True:
            # Receive message from frontend
            data = await websocket.receive_text()
            print(f"WebSocket received: {data}")
            
            # Route message to appropriate handler
            handled = False
            for prefix, handler in MESSAGE_HANDLERS.items():
                if data.startswith(prefix):
                    await handler(websocket, data)
                    handled = True
                    break
            
            # Handle special cases
            if not handled:
                # `status` is a small built-in command to request server state
                if data == "status":
                    await handlers.handle_status(websocket)
                else:
                    await websocket.send_text(f"❓ Unknown command: {data}")
    
    except Exception as e:
        print(f"WebSocket error: {e}")
        # Cleanup: disconnect and remove any OPCUA clients that belonged to
        # this websocket. Handlers should also perform their own cleanup.
        for url, client in list(clients.items()):
            if hasattr(client, 'websocket') and client.websocket == websocket:
                await client.disconnect()
                del clients[url]
