import json
from fastapi import WebSocket
from typing import Dict

from dt_robot_control.opcua.opcua_client import OPCUAClient
from dt_robot_control.services.client_registry import client_registry

from dt_robot_control.opcua.subscription_manager import SubscriptionManager

# --- Helper Functions ---


def get_client(url: str) -> OPCUAClient | None:
    """Get a client for the given URL or None."""
    return client_registry.get(url)


# --- Helper Functions for Client Info ---

async def try_read_model(client: OPCUAClient):
    """Reads the model if available."""
    if not client.is_robotics_server:
        return
    try:
        return await client.read_model()
    except Exception as e:
        return f"❌ Model read error: {e}"

async def try_read_serialnumber(client: OPCUAClient):
    """Reads the serial number if available."""
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
            await websocket.send_text(f"{url}|Method call result: {result}")
        else:
            await websocket.send_text(f"{url}|❌ No OPC UA client found for method call.")
    except Exception as e:
        # If we can't parse the payload, we might not have the URL. 
        # But usually the client sends valid JSON with URL.
        # Fallback to broad error broadcasting if URL is unknown is risky but acceptable for debug.
        # Or try to extract URL directly from string if JSON fails?
        # For now, just send error. If we don't know URL, frontend global handler might catch it or it will be ignored.
        await websocket.send_text(f"Global|❌ Error parsing call payload: {e}")

async def handle_subscribe(websocket: WebSocket, data: str) -> None:
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
    """Unsubscribes from event notifications on a node."""
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
    """Ends a custom subscription."""
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
    """Connects to an OPC UA server."""
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
        websocket: Active WebSocket connection.
        data: Message format "stream joint position|url".

    Returns:
        None. Sends streaming confirmation or error, then continuous angle updates.
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
        websocket: Active WebSocket connection.
        data: Message format "cancel stream joint position|url".

    Returns:
        None. Sends cancellation confirmation or error via websocket.
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
        websocket: Active WebSocket connection.
        data: Message format "stream mode|url".

    Returns:
        None. Sends streaming confirmation or error, then continuous mode updates.
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
    """Stops streaming the operation mode."""
    url = data.split("|", 1)[1].strip()
    client = get_client(url)

    if client:
        manager = client.subscription_manager
        await manager.stop_mode_subscription()
        await websocket.send_text(f"{url}|Streaming 'Mode' cancelled for {url}")
    else:
        await websocket.send_text(f"{url}|❌ No OPC UA client found for {url}")

async def handle_status(websocket: WebSocket) -> None:
    """Returns connection status and device information."""
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
            # break # FIXME: Should we iterate all or break? Original code broke after first.
            # If we support multi, we should probably send statuses for all.
            # But "status" command implies "Are you alive?". 
            # If frontend handles multiple messages, better to remove break? 
            # I'll stick to prefixing for now.
             
        except Exception as e:
            await websocket.send_text(f"{url}|❌ Status check failed: {str(e)}")

async def handle_disconnect(websocket: WebSocket, data: str) -> None:
    """Disconnect from the OPC UA server and clean up subscriptions."""
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