"""WebSocket router for OPC UA operations.

Accepts connections and routes incoming messages to appropriate handlers.
"""

from typing import Dict
from fastapi import APIRouter, WebSocket

from src.api.websocket import handlers
from src.opcua.client import OPCUAClient


# --- WebSocket Endpoint ---
router = APIRouter()

# Temporary clients map. Will be replaced with a proper manager/service.
clients: Dict[str, OPCUAClient] = {}

# Message dispatch table: prefix -> handler function
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
    """WebSocket endpoint for real-time OPC UA communication.
    
    Accepts a connection and routes incoming messages to appropriate handlers
    based on the message prefix (e.g., "subscribe|", "call|", etc.).
    """
    await websocket.accept()
    print("WebSocket connected.")
    
    # Give handlers access to clients dict
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
                if data == "status":
                    await handlers.handle_status(websocket)
                else:
                    await websocket.send_text(f"❓ Unknown command: {data}")
    
    except Exception as e:
        print(f"WebSocket error: {e}")
        # Cleanup disconnected clients
        for url, client in list(clients.items()):
            if hasattr(client, 'websocket') and client.websocket == websocket:
                await client.disconnect()
                del clients[url]
