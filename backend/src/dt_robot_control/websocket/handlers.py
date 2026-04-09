"""
Handles WebSocket messages for OPC UA actions (connect, subscribe, call, stream).  
Separated from `opcua_client` so message parsing and dispatching are easier to test and maintain.  
Uses the shared SubscriptionManager/NodeManager for all robots.  
Messages are prefixed with the robot URL so one WebSocket can handle multiple robots safely.
"""

import json
from fastapi import WebSocket
from typing import Dict

from dt_robot_control.opcua.opcua_client import OPCUAClient
from dt_robot_control.services.client_registry import client_registry

from dt_robot_control.opcua.subscription_manager import SubscriptionManager

# --- Helper Functions ---


def get_client(url: str) -> OPCUAClient | None:
    """Get a client for the given URL or None.

    Args:
        url (str): OPC UA server URL.

    Returns:
        OPCUAClient | None: Client instance or None.
    """
    return client_registry.get(url)


# --- Helper Functions for Client Info ---

async def try_read_model(client: OPCUAClient):
    """Read the model if available.

    Args:
        client (OPCUAClient): OPCUAClient instance.

    Returns:
        str | None: Model string or None.
    """
    if not client.is_robotics_server:
        return
    try:
        return await client.read_model()
    except Exception as e:
        return f"❌ Model read error: {e}"

async def try_read_serialnumber(client: OPCUAClient):
    """Read the serial number if available.

    Args:
        client (OPCUAClient): OPCUAClient instance.

    Returns:
        str | None: Serial number string or None.
    """
    if not client.is_robotics_server:
        return
    try:
        return await client.read_serial_number()
    except Exception as e:
        return f"❌ SerialNumber read error: {e}"


# --- WebSocket Handlers ---

async def handle_call(websocket: WebSocket, data: str) -> None:
    """Handle OPC UA method call requests from frontend.

    Args:
        websocket (WebSocket): Active WebSocket connection to send responses.
        data (str): Raw message string in format "call|{json}".

    Returns:
        None
    """
    try:
        payload = json.loads(data.split("|", 1)[1].strip())
        url = payload.get("url")
        node_id = payload.get("nodeId")
        inputs = payload.get("inputs", {})
        client = get_client(url)
        if client:
            result = await client.call_method(node_id, inputs)
            await websocket.send_text(f"{url}|Method call result: {result}")
        else:
            await websocket.send_text(f"{url}|❌ No OPC UA client found for method call.")
    except Exception as e:
        await websocket.send_text(f"Global|❌ Error parsing call payload: {e}")

async def handle_subscribe(websocket: WebSocket, data: str) -> None:
    """Subscribe to variable changes on a specific node.

    Args:
        websocket (WebSocket): Active WebSocket connection.
        data (str): Message format "subscribe|{json}" with url and nodeId.

    Returns:
        None
    """
    try:
        payload = json.loads(data.split("|", 1)[1].strip())
        url, node_id = payload.get("url"), payload.get("nodeId")
        client = get_client(url)
        
        if not url or not node_id:
            await websocket.send_text("Global|❌ subscribe: url and nodeId must be provided.")
            return

        if not client:
            await websocket.send_text(f"{url}|❌ No OPC UA client connected for URL: {url}")
            return

        manager = client.subscription_manager
        # --- Prevent duplicate subscriptions ---
        if hasattr(client, "custom_subscriptions") and node_id in manager.custom_subscriptions:
            await websocket.send_text(f"{url}|⚠️ Already subscribed to variable at {node_id} on {url}")
            return

        await manager.subscribe_custom(node_id, websocket)
        await websocket.send_text(f"{url}|✅ Subscribed to variable at {node_id} on {url}")
    except Exception as e:
        await websocket.send_text(f"Global|❌ subscribe error: {e}")

async def handle_subscribe_event(websocket: WebSocket, data: str) -> None:
    """Subscribe to events on a specific node.

    Args:
        websocket (WebSocket): Active WebSocket connection.
        data (str): Message format "subscribeEvent|{json}" with url and nodeId.

    Returns:
        None
    """
    try:
        payload = json.loads(data.split("|", 1)[1].strip())
        url = payload.get("url")
        node_id = payload.get("nodeId")

        client = get_client(url)
        
        if not client:
            await websocket.send_text(f"{url}|❌ No OPC UA client found for {url}")
            return
        
        manager = client.subscription_manager
        success = await manager.subscribe_events_on_node(node_id)
        if success:
            await websocket.send_text(f"{url}|✅ Subscribed to events on node {node_id}")  # sends results back to frontend through websocket
        else:
            await websocket.send_text(f"{url}|❌ Failed to subscribe to events on node {node_id}")
    except Exception as e:
        await websocket.send_text(f"Global|❌ Event subscription error: {e}")

async def handle_unsubscribe_event(websocket: WebSocket, data: str) -> None:
    """Unsubscribe from event notifications on a node.

    Args:
        websocket (WebSocket): Active WebSocket connection.
        data (str): Message format "unsubscribeEvent|{json}".

    Returns:
        None
    """
    try:
        payload = json.loads(data.split("|", 1)[1].strip())
        url = payload.get("url")

        client = get_client(url)
        
        if not client:
            await websocket.send_text(f"{url}|❌ No OPC UA client found for {url}")
            return

        manager = client.subscription_manager
        success = await manager.unsubscribe_events()
        if success:
            await websocket.send_text(f"{url}|✅ Event subscription removed for {url}")
        else:
            await websocket.send_text(f"{url}|⚠️ No active event subscription to remove for {url}")
    except Exception as e:
        await websocket.send_text(f"Global|❌ Unsubscribe event error: {e}")

async def handle_unsubscribe(websocket: WebSocket, data: str) -> None:
    """End a custom subscription.

    Args:
        websocket (WebSocket): Active WebSocket connection.
        data (str): Message format "unsubscribe|{json}".

    Returns:
        None
    """
    try:
        payload = json.loads(data.split("|", 1)[1].strip())
        url, node_id = payload.get("url"), payload.get("nodeId")
        client = get_client(url)
        
        if not client:
            await websocket.send_text(f"{url}|❌ No subscription found for {node_id} on {url}")
            return
        
        manager = client.subscription_manager
        success = await manager.unsubscribe_custom(node_id)
        if success:
            msg = json.dumps({"nodeId": node_id, "url": url})
            await websocket.send_text(f"{url}|x|unsubscribe:{msg}")
            await websocket.send_text(f"{url}|✅ Unsubscribed from variable at {node_id} on {url}")
        else:
            await websocket.send_text(f"{url}|❌ No subscription found for {node_id} on {url}")
    except Exception as e:
        await websocket.send_text(f"Global|❌ unsubscribe error: {e}")

async def handle_connect(websocket: WebSocket, data: str) -> None:
    """Connect to an OPC UA server.

    Args:
        websocket (WebSocket): Active WebSocket connection.
        data (str): Message format "connect|url".

    Returns:
        None
    """
    url = data.split("|", 1)[1].strip()
    if client_registry.has(url):
        await websocket.send_text(f"{url}|⚠️ Already connected to {url}")
        return
    try:
        client = OPCUAClient(url, name=url, websocket=websocket)
        await client.connect()
        await client.has_robotics_namespace()
        client_registry.add(url, client)
        if client.is_robotics_server:
            await websocket.send_text(f"{url}|✅ OPC UA server supports 'Robotics Namespace'.")
            model_text = await try_read_model(client)
            sn_text = await try_read_serialnumber(client)
            await websocket.send_text(f"{url}|Model: {model_text}\nSerial Number: {sn_text}")
        else:
            await websocket.send_text(f"{url}|❌ 'Robotics Namespace' not listed in NamespaceArray.")

        await websocket.send_text(f"{url}|✅ Connected to {url}")
    except Exception as e:
        await websocket.send_text(f"{url}|❌ Connection failed to {url}: {str(e)}")

async def handle_stream_joint_position(websocket: WebSocket, data: str) -> None:
    """Start streaming joint angle positions continuously.

    Args:
        websocket (WebSocket): Active WebSocket connection.
        data (str): Message format "stream joint position|url".

    Returns:
        None
    """
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    
    if client:
        manager = client.subscription_manager
        await manager.subscribe_axes_actual_positions()
        await websocket.send_text(f"{url}|Streaming joint positions for {url}")
    else:
        await websocket.send_text(f"{url}|❌ No OPC UA client found for {url}")

async def handle_cancel_stream_joint_position(websocket: WebSocket, data: str) -> None:
    """Stop streaming joint angle positions.

    Args:
        websocket (WebSocket): Active WebSocket connection.
        data (str): Message format "cancel stream joint position|url".

    Returns:
        None
    """
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    
    if client:
        manager = client.subscription_manager
        await manager.stop_axes_subscription()
        await websocket.send_text(f"{url}|Streaming 'Joint position' cancelled for {url}")
    else:
        await websocket.send_text(f"{url}|❌ No OPC UA client found for {url}")

async def handle_stream_mode(websocket: WebSocket, data: str) -> None:
    """Start streaming robot operation mode continuously.

    Args:
        websocket (WebSocket): Active WebSocket connection.
        data (str): Message format "stream mode|url".

    Returns:
        None
    """
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    
    if client:
        manager = client.subscription_manager
        await manager.subscribe_mode()
        await websocket.send_text(f"{url}|Streaming Mode for {url}")
    else:
        await websocket.send_text(f"{url}|❌ No OPC UA client found for {url}")

async def handle_cancel_stream_mode(websocket: WebSocket, data: str) -> None:
    """Stop streaming the operation mode.

    Args:
        websocket (WebSocket): Active WebSocket connection.
        data (str): Message format "cancel stream mode|url".

    Returns:
        None
    """
    url = data.split("|", 1)[1].strip()
    client = get_client(url)

    if client:
        manager = client.subscription_manager
        await manager.stop_mode_subscription()
        await websocket.send_text(f"{url}|Streaming 'Mode' cancelled for {url}")
    else:
        await websocket.send_text(f"{url}|❌ No OPC UA client found for {url}")

async def handle_status(websocket: WebSocket) -> None:
    """Return connection status and device information.

    Args:
        websocket (WebSocket): Active WebSocket connection.

    Returns:
        None
    """
    all_clients = client_registry.all()
    if not all_clients:
        await websocket.send_text("Global|System Ready")
        return
    for url, client in all_clients.items():
        try:
            model_text = await try_read_model(client)
            sn_text = await try_read_serialnumber(client)
            await websocket.send_text(f"{url}|✅ Connected to {url}")
            await websocket.send_text(f"{url}|Model: {model_text}\nSerial Number: {sn_text}")
             
        except Exception as e:
            await websocket.send_text(f"{url}|❌ Status check failed: {str(e)}")

async def handle_disconnect(websocket: WebSocket, data: str) -> None:
    """Disconnect from the OPC UA server and clean up subscriptions.

    Args:
        websocket (WebSocket): Active WebSocket connection.
        data (str): Message format "disconnect|url".

    Returns:
        None
    """
    url = data.split("|", 1)[1].strip()
    client = get_client(url)

    if client:
        manager = client.subscription_manager
        await manager.stop_axes_subscription()
        await manager.stop_mode_subscription()
        for nodeid in list(manager.custom_subscriptions.keys()):
            await manager.unsubscribe_custom(nodeid)
        await client.disconnect()
        client_registry.remove(url)
        await websocket.send_text(f"{url}|🔌 Disconnected from {url}")
    else:
        await websocket.send_text(f"{url}|❌ No client found for {url}")