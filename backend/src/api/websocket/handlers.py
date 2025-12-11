import json
from fastapi import WebSocket
from typing import Dict

from src.opcua.client import OPCUAClient

# Temporary: will be replaced with service later
clients: Dict[str, OPCUAClient] = {}

#--- Helper Functions ---

def get_client(url: str) -> OPCUAClient | None:
    """Get a client for the given URL or None."""
    return clients.get(url)

# --- WebSocket Handlers ---

async def handle_call(websocket, data):
    """Handle OPC UA method call requests from frontend.

    Args:
        websocket: Active WebSocket connection to send responses.
        data: Raw message string in format "call|{json}".

    Returns:
        None. Sends result via websocket.
    """
    try:
        payload = json.loads(data.split("|", 1)[1].strip())
        url = payload.get("url")
        node_id = payload.get("nodeId")
        inputs = payload.get("inputs", {})
        client = get_client(url)
        if client:
            result = await client.call_method(node_id, inputs)
            await websocket.send_text(f"Method call result: {result}")
        else:
            await websocket.send_text("❌ No OPC UA client found for method call.")
    except Exception as e:
        await websocket.send_text(f"❌ Error parsing call payload: {e}")

async def handle_subscribe(websocket, data):
    """Subscribe to variable changes on a specific node.

    Args:
        websocket: Active WebSocket connection.
        data: Message format "subscribe|{json}" with url and nodeId.

    Returns:
        None. Sends subscription confirmation or error via websocket.
    """
    try:
        payload = json.loads(data.split("|", 1)[1].strip())
        url, node_id = payload.get("url"), payload.get("nodeId")
        client = get_client(url)
        if not url or not node_id:
            await websocket.send_text("❌ subscribe: url and nodeId must be provided.")
            return
        if not client:
            await websocket.send_text(f"❌ No OPC UA client connected for URL: {url}")
            return

        # --- Prevent duplicate subscriptions ---
        if hasattr(client, "custom_subscriptions") and node_id in client.custom_subscriptions:
            await websocket.send_text(f"⚠️ Already subscribed to variable at {node_id} on {url}")
            return

        await client.subscribe_custom(node_id, websocket)
        await websocket.send_text(f"✅ Subscribed to variable at {node_id} on {url}")
    except Exception as e:
        await websocket.send_text(f"❌ subscribe error: {e}")

async def handle_subscribe_event(websocket, data):
    """Subscribe to events on a specific node.

    Args:
        websocket: Active WebSocket connection.
        data: Message format "subscribeEvent|{json}" with url and nodeId.

    Returns:
        None. Sends subscription confirmation or error via websocket.
    """
    try:
        payload = json.loads(data.split("|", 1)[1].strip())
        url = payload.get("url")
        node_id = payload.get("nodeId")

        client = get_client(url)
        if not client:
            await websocket.send_text(f"❌ No OPC UA client found for {url}")
            return

        success = await client.subscribe_events_on_node(node_id)
        if success:
            await websocket.send_text(f"✅ Subscribed to events on node {node_id}")  # sends results back to frontend through websocket
        else:
            await websocket.send_text(f"❌ Failed to subscribe to events on node {node_id}")
    except Exception as e:
        await websocket.send_text(f"❌ Event subscription error: {e}")

async def handle_unsubscribe_event(websocket, data):
    """Unsubscribes from event notifications on a node."""
    try:
        payload = json.loads(data.split("|", 1)[1].strip())
        url = payload.get("url")

        client = get_client(url)
        if not client:
            await websocket.send_text(f"❌ No OPC UA client found for {url}")
            return

        success = await client.unsubscribe_events()
        if success:
            await websocket.send_text(f"✅ Event subscription removed for {url}")
        else:
            await websocket.send_text(f"⚠️ No active event subscription to remove for {url}")
    except Exception as e:
        await websocket.send_text(f"❌ Unsubscribe event error: {e}")

async def handle_unsubscribe(websocket, data):
    """Ends a custom subscription."""
    try:
        payload = json.loads(data.split("|", 1)[1].strip())
        url, node_id = payload.get("url"), payload.get("nodeId")
        client = get_client(url)
        if not client:
            await websocket.send_text(f"❌ No subscription found for {node_id} on {url}")
            return
        success = await client.unsubscribe_custom(node_id)
        if success:
            msg = json.dumps({"nodeId": node_id, "url": url})
            await websocket.send_text(f"x|unsubscribe:{msg}")
            await websocket.send_text(f"✅ Unsubscribed from variable at {node_id} on {url}")
        else:
            await websocket.send_text(f"❌ No subscription found for {node_id} on {url}")
    except Exception as e:
        await websocket.send_text(f"❌ unsubscribe error: {e}")

async def handle_connect(websocket, data):
    """Connects to an OPC UA server."""
    url = data.split("|", 1)[1].strip()
    if url in clients:
        await websocket.send_text(f"⚠️ Already connected to {url}")
        return
    try:
        client = OPCUAClient(url, name=url, websocket=websocket)
        await client.connect()
        await client.check_robotics_support()
        clients[url] = client
        if client.is_robotics_server:
            await websocket.send_text("✅ OPC UA server supports 'Robotics Namespace'.")
            model_text = await try_read_model(client)
            sn_text = await try_read_serialnumber(client)
            await websocket.send_text(f"Model: {model_text}\nSerial Number: {sn_text}")
        else:
            await websocket.send_text("❌ 'Robotics Namespace' not listed in NamespaceArray.")

        await websocket.send_text(f"✅ Connected to {url}")
    except Exception as e:
        await websocket.send_text(f"❌ Connection failed to {url}: {str(e)}")

async def handle_stream_joint_position(websocket, data):
    """Start streaming joint angle positions continuously.

    Args:
        websocket: Active WebSocket connection.
        data: Message format "stream joint position|url".

    Returns:
        None. Sends streaming confirmation or error, then continuous angle updates.
    """
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    if client:
        await client.subscribe_axes_actual_positions()
        await websocket.send_text(f"Streaming joint positions for {url}")
    else:
        await websocket.send_text(f"❌ No OPC UA client found for {url}")

async def handle_cancel_stream_joint_position(websocket, data):
    """Stop streaming joint angle positions.

    Args:
        websocket: Active WebSocket connection.
        data: Message format "cancel stream joint position|url".

    Returns:
        None. Sends cancellation confirmation or error via websocket.
    """
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    if client:
        await client.stop_axes_subscription()
        await websocket.send_text(f"Streaming 'Joint position' cancelled for {url}")
    else:
        await websocket.send_text(f"❌ No OPC UA client found for {url}")

async def handle_stream_mode(websocket, data):
    """Start streaming robot operation mode continuously.

    Args:
        websocket: Active WebSocket connection.
        data: Message format "stream mode|url".

    Returns:
        None. Sends streaming confirmation or error, then continuous mode updates.
    """
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    if client:
        await client.subscribe_mode()
        await websocket.send_text(f"Streaming Mode for {url}")
    else:
        await websocket.send_text(f"❌ No OPC UA client found for {url}")

async def handle_cancel_stream_mode(websocket, data):
    """Stops streaming the operation mode."""
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    if client:
        await client.stop_mode_subscription()
        await websocket.send_text(f"Streaming 'Mode' cancelled for {url}")
    else:
        await websocket.send_text(f"❌ No OPC UA client found for {url}")

async def handle_status(websocket):
    """Returns connection status and device information."""
    if not clients:
        await websocket.send_text("🔌 Disconnected")
        return
    for url, client in clients.items():
        try:
            model_text = await try_read_model(client)
            sn_text = await try_read_serialnumber(client)
            await websocket.send_text(f"✅ Connected to {url}")
            await websocket.send_text(f"Model: {model_text}\nSerial Number: {sn_text}")
            break
        except Exception as e:
            await websocket.send_text(f"❌ Status check failed: {str(e)}")

async def handle_disconnect(websocket, data):
    """Disconnect from the OPC UA server and clean up subscriptions."""
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    if client:
        await client.stop_axes_subscription()
        await client.stop_mode_subscription()
        for nodeid in list(client.custom_subscriptions.keys()):
            await client.unsubscribe_custom(nodeid)
        await client.disconnect()
        del clients[url]
        await websocket.send_text(f"🔌 Disconnected from {url}")
    else:
        await websocket.send_text(f"❌ No client found for {url}")