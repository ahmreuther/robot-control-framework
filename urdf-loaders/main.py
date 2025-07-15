import os
import json
import uvicorn
from fastapi import FastAPI, WebSocket, Request, Query
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from asyncua import ua

# Eigene Module
from modules.OPCUAClient import OPCUAClient
from modules.GetAddressSpace import collect_node_details

# --- App Setup ---

app = FastAPI()
clients: dict[str, OPCUAClient] = {}

STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_IMAGE_DIR = os.path.join(STATIC_DIR, "static")
templates = Jinja2Templates(directory="templates")

# --- Hilfsfunktionen ---

def get_client(url: str) -> OPCUAClient | None:
    """Hole einen Client für die gegebene URL oder None."""
    return clients.get(url)

# --- WebSocket Endpoint ---

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket connected.")

    async def send(msg):
        try:
            await websocket.send_text(msg)
        except Exception as e:
            print(f"Send Error: {e}")

    handlers = {
        "call|": handle_call,
        "subscribe|": handle_subscribe,
        "unsubscribe|": handle_unsubscribe,
        "subscribeEvent|": handle_subscribe_event,
        "unsubscribeEvent|": handle_unsubscribe_event,
        "connect|": handle_connect,
        "stream joint position|": handle_stream_joint_position,
        "cancel stream joint position|": handle_cancel_stream_joint_position,
        "stream mode|": handle_stream_mode,
        "cancel stream mode|": handle_cancel_stream_mode,
        "disconnect|": handle_disconnect,
    }

    while True:
        try:
            data = await websocket.receive_text()
            print(f"WebSocket received: {data}")

            handled = False
            for prefix, handler in handlers.items():
                if data.startswith(prefix):
                    await handler(websocket, data)
                    handled = True
                    break

            if not handled:
                if data == "status":
                    await handle_status(websocket)
                else:
                    await send(f"❓ Unknown command: {data}")

        except Exception as e:
            print(f"WebSocket error: {e}")
            # Optional: Clean up disconnected client
            for url, client in list(clients.items()):
                if client.websocket == websocket:
                    await client.disconnect()
                    del clients[url]
            break

# --- WebSocket Handler ---

async def handle_call(websocket, data):
    """Ruft eine OPC UA Methode auf."""
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
    """Startet eine Custom-Subscription auf eine Variable, wenn nicht bereits abonniert."""
    try:
        payload = json.loads(data.split("|", 1)[1].strip())
        url, node_id = payload.get("url"), payload.get("nodeId")
        client = get_client(url)
        if not url or not node_id:
            await websocket.send_text("❌ subscribe: url und nodeId müssen übergeben werden.")
            return
        if not client:
            await websocket.send_text(f"❌ No OPC UA client connected for URL: {url}")
            return

        # --- DOPPELTE Subscription verhindern ---
        if hasattr(client, "custom_subscriptions") and node_id in client.custom_subscriptions:
            await websocket.send_text(f"⚠️ Already subscribed to variable at {node_id} on {url}")
            return

        await client.subscribe_custom(node_id, websocket)
        await websocket.send_text(f"✅ Subscribed to variable at {node_id} on {url}")
    except Exception as e:
        await websocket.send_text(f"❌ subscribe error: {e}")

async def handle_subscribe_event(websocket, data):
    """Abonniert Events auf einem konkreten Node."""
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
            await websocket.send_text(f"✅ Subscribed to events on node {node_id}")
        else:
            await websocket.send_text(f"❌ Failed to subscribe to events on node {node_id}")
    except Exception as e:
        await websocket.send_text(f"❌ Event subscription error: {e}")



async def handle_unsubscribe_event(websocket, data):
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
    """Beendet eine Custom-Subscription."""
    try:
        payload = json.loads(data.split("|", 1)[1].strip())
        url, node_id = payload.get("url"), payload.get("nodeId")
        client = get_client(url)
        if not client:
            await websocket.send_text(f"❌ No subscription found for {node_id} on {url}")
            return
        # **Hier der neue Aufruf:**
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
    """Verbindet sich mit einem OPC UA Server."""
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
    """Startet das Streaming der Achspositionen."""
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    if client:
        await client.subscribe_axes_actual_positions()
        await websocket.send_text(f"Streaming joint positions for {url}")
    else:
        await websocket.send_text(f"❌ No OPC UA client found for {url}")

async def handle_cancel_stream_joint_position(websocket, data):
    """Beendet das Streaming der Achspositionen."""
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    if client:
        await client.stop_axes_subscription()
        await websocket.send_text(f"Streaming 'Joint position' cancelled for {url}")
    else:
        await websocket.send_text(f"❌ No OPC UA client found for {url}")

async def handle_stream_mode(websocket, data):
    """Startet das Streaming des Modus."""
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    if client:
        await client.subscribe_mode()
        await websocket.send_text(f"Streaming Mode for {url}")
    else:
        await websocket.send_text(f"❌ No OPC UA client found for {url}")

async def handle_cancel_stream_mode(websocket, data):
    """Beendet das Streaming des Modus."""
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    if client:
        await client.stop_mode_subscription()
        await websocket.send_text(f"Streaming 'Mode' cancelled for {url}")
    else:
        await websocket.send_text(f"❌ No OPC UA client found for {url}")


async def handle_status(websocket):
    """Gibt den Verbindungsstatus und Geräteinformationen zurück."""
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
    """Trennt die Verbindung zum OPC UA Server."""
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

# --- OPC UA Node Utilities ---

async def try_read_model(client: OPCUAClient):
    """Liest das Modell aus, wenn vorhanden."""
    if not client.is_robotics_server:
        return 
    try:
        node = await client.find_child_by_browse_name_recursive(
            ["0:Objects", "2:DeviceSet", "0:MotionDeviceSystem", "3:MotionDevices"], "2:Model"
        )
        if node:
            val = await node.read_value()
            return val.Text if hasattr(val, 'Text') else str(val)
        return "None"
    except Exception as e:
        return f"❌ Model read error: {e}"

async def try_read_serialnumber(client: OPCUAClient):
    """Liest die Seriennummer aus, wenn vorhanden."""
    if not client.is_robotics_server:
        return 
    try:
        node = await client.find_child_by_browse_name_recursive(
            ["0:Objects", "2:DeviceSet", "0:MotionDeviceSystem", "3:MotionDevices"], "2:SerialNumber")
        if node:
            val = await node.read_value()
            return val.Text if hasattr(val, 'Text') else str(val)
        return "None"
    except Exception as e:
        return f"❌ SerialNumber read error: {e}"

# --- REST API Endpunkte für Node-Rendering ---

@app.get("/device_set_rendered")
async def get_device_set(request: Request, url: str = Query(...)):
    """Zeigt den vollständigen DeviceSet-Baum."""
    client = get_client(url)
    if not client:
        return templates.TemplateResponse(
            "device_set.html",
            {"request": request, "items": [], "error": f"No OPC UA client connected for URL: {url}"}
        )
    try:
        root = client.client.get_root_node()
        detailed = await collect_node_details(root)
        return templates.TemplateResponse("device_set.html", {"request": request, "items": detailed})
    except Exception as e:
        print("Error while reading DeviceSet:", e)
        return templates.TemplateResponse(
            "device_set.html",
            {"request": request, "items": [], "error": str(e)}
        )

@app.get("/subtree_children")
async def subtree_children(request: Request, url: str = Query(...), nodeid: str = Query(...)):
    """Zeigt die Kinder eines Knotens."""
    client = get_client(url)
    if not client:
        return "No OPC UA client connected"
    node = client.client.get_node(nodeid)
    detailed = await collect_node_details(node, children_depth=2)
    return templates.TemplateResponse("children_fragment.html", {"request": request, "items": detailed})

@app.get("/node_rendered")
async def node_rendered(request: Request, url: str = Query(...), nodeid: str = Query(...)):
    """Zeigt Details zu einem einzelnen Knoten."""
    client = get_client(url)
    if not client:
        return "No OPC UA client for this URL"
    node = client.client.get_node(nodeid)
    detail = await collect_node_details(node, children_depth=0) 
    return templates.TemplateResponse("node_fragment.html", {"request": request, "item": detail})


@app.get("/references")
async def get_references(url: str = Query(...), nodeid: str = Query(...)):
    client = get_client(url)
    if not client:
        return {"error": f"No OPC UA client connected for {url}"}
    
    try:
        node = client.client.get_node(nodeid)
        refs = await node.get_references()

        if refs:
            refs = refs[1:]  # <-- erstes Element löschen

        async def safe_display_name(node_id):
            try:
                dn_node = client.client.get_node(node_id)
                display_name = await dn_node.read_display_name()
                text = display_name.Text.strip() if display_name and display_name.Text else ""
                return text if text else "null"
            except Exception:
                return "null"


        async def ref_to_dict(ref: ua.ReferenceDescription):
            ref_type_name = await safe_display_name(ref.ReferenceTypeId)
            type_def_name = await safe_display_name(ref.TypeDefinition) if ref.TypeDefinition.Identifier != 0 else "Null"

            return {
                "ReferenceType": f"{ref_type_name} ({ref.ReferenceTypeId.to_string()})",
                "NodeId": ref.NodeId.to_string(),
                "BrowseName": ref.BrowseName.to_string(),
                "TypeDefinition": f"{type_def_name} ({ref.TypeDefinition.to_string()})" if type_def_name != "Null" else "Null"
            }

        result = []
        for ref in refs:
            result.append(await ref_to_dict(ref))

        return result

    except Exception as e:
        return {"error": str(e)}


# --- Static File Serving & Startpunkt ---

app.mount("/static", StaticFiles(directory=STATIC_IMAGE_DIR), name="static")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="root")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
