import os
import asyncio
from typing import List
import json
import uvicorn
from fastapi import FastAPI, WebSocket, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from asyncua import ua

from mcp.server.fastmcp import FastMCP
import websockets

# Own modules
from modules.OPCUAClient import OPCUAClient
from modules.GetAddressSpace import collect_node_details

# --- App Setup ---

app = FastAPI()

origins = [
    "http://localhost:1234",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
clients: dict[str, OPCUAClient] = {}

STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory="templates")

# --- Helper functions ---

def get_client(url: str) -> OPCUAClient | None:
    """Get a client for the given URL or None."""
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
            # Optional: clean up disconnected client
            for url, client in list(clients.items()):
                if client.websocket == websocket:
                    await client.disconnect()
                    del clients[url]
            break

# --- WebSocket Handlers ---

async def handle_call(websocket, data):
    """Calls an OPC UA method."""
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
    """Starts a custom subscription on a variable, if not already subscribed."""
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
    """Subscribes to events on a specific node."""
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
    """Starts streaming joint positions."""
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    if client:
        await client.subscribe_axes_actual_positions()
        await websocket.send_text(f"Streaming joint positions for {url}")
    else:
        await websocket.send_text(f"❌ No OPC UA client found for {url}")

async def handle_cancel_stream_joint_position(websocket, data):
    """Stops streaming joint positions."""
    url = data.split("|", 1)[1].strip()
    client = get_client(url)
    if client:
        await client.stop_axes_subscription()
        await websocket.send_text(f"Streaming 'Joint position' cancelled for {url}")
    else:
        await websocket.send_text(f"❌ No OPC UA client found for {url}")

async def handle_stream_mode(websocket, data):
    """Starts streaming the operation mode."""
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
    """Disconnects from the OPC UA server."""
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

# --- REST API Endpoints for Node Rendering ---

@app.get("/device_set_rendered")
async def get_device_set(request: Request, url: str = Query(...)):
    """Shows the complete DeviceSet tree."""
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
    """Shows the children of a node."""
    client = get_client(url)
    if not client:
        return "No OPC UA client connected"
    node = client.client.get_node(nodeid)
    detailed = await collect_node_details(node, children_depth=2)
    return templates.TemplateResponse("children_fragment.html", {"request": request, "items": detailed})

@app.get("/node_rendered")
async def node_rendered(request: Request, url: str = Query(...), nodeid: str = Query(...)):
    """Shows details of a single node."""
    client = get_client(url)
    if not client:
        return "No OPC UA client for this URL"
    node = client.client.get_node(nodeid)
    detail = await collect_node_details(node, children_depth=0) 
    return templates.TemplateResponse("node_fragment.html", {"request": request, "item": detail})

@app.get("/references")
async def get_references(url: str = Query(...), nodeid: str = Query(...)):
    """Shows references of a node."""
    client = get_client(url)
    if not client:
        return {"error": f"No OPC UA client connected for {url}"}
    
    try:
        node = client.client.get_node(nodeid)
        refs = await node.get_references()

        if refs:
            refs = refs[1:]  # <-- remove first element

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

#
# MCP Integration
#
mcp = FastMCP("Robotics MCP Server", stateless_http=True)

angles = []
tool_center_point = []
tool_center_point_rot = []

target_tcp_pos = None
# socket: websockets.ServerConnection
CONNECTIONS = set()

@mcp.resource("resource://my-resource")
async def root():
    return {"message": "Hello from FastMCP"}

# --- WebSocket server ---
async def ws_handler(websocket:websockets.ServerConnection):
    CONNECTIONS.add(websocket)
    async for message in websocket:
        data = str(message)
        # print(data)
        if data.startswith("TCP|"):
            tcp = data.removeprefix("TCP|")
            (tcp_pos, tcp_rot) = tcp.split(";")
            tcp_pos = tcp_pos.removeprefix("Pos:")
            tcp = tcp_pos.strip()
            (x,y,z) = tcp.split(", ")
            print(f"X={x} Y={y} Z={z}")
            global tool_center_point
            tool_center_point = [x,y,z]
            # print(tool_center_point)

            tcp_rot = tcp_rot.removeprefix("Rot:")
            tcp = tcp_rot.strip()
            (a,b,c,d) = tcp.split(", ")
            global tool_center_point_rot
            tool_center_point_rot = [a,b,c,d]
            # print(f"A={a} B={b} C={c} D={d}")
        # await websocket.send(message)
        elif data.startswith("ANGLES|"):
            raw_angles = data.removeprefix("ANGLES|")
            global angles
            angles = []
            for a in raw_angles.split(','):
                (_, a) = a.split(':')
                a = a.strip()
                angles.append(a)
            print(*angles)

@mcp.tool(name="get tcp position", description="Get the current tcp position of the roboter tool center point based on the fixed coordinate system")
def get_tcp() -> str:
    print(tool_center_point)
    return f"X={tool_center_point[0]}m, Y={tool_center_point[1]}m, Z={tool_center_point[2]}m"

@mcp.tool(name="get tcp rotation quarternions", description="Get the current tcp rotation of the roboter tool center point in quarternions")
def get_tcp_rotation() -> str:
    print(tool_center_point_rot)
    return f"{tool_center_point_rot[0]}, {tool_center_point_rot[1]}, {tool_center_point_rot[2]}, {tool_center_point_rot[3]}"

@mcp.tool(name="get joint angles", description="Returns the current joint angles of the robot")
def get_joint_angles() -> str:
    angles_str = ""
    for i,a in enumerate(angles):
        angles_str += f"Joint {i+1}={a}"
    return angles_str

@mcp.tool(name="set joint angles", description="Sets the current joint angles of the robot")
async def set_joint_angles(joint_angles: List):
    for socket in CONNECTIONS:
        # print(f"TCP_POS|{x},{y},{z}")
        joint_angle_str = ", ".join(joint_angles)
        print(joint_angle_str)
        await socket.send(f"JOINTS|{joint_angle_str}")

@mcp.tool(name="set tcp pos", description="Sets the tcp position to the parameters based on the fixed coordinate system")
async def set_tcp_pos(x, y, z):
    print(x,y,z)
    for socket in CONNECTIONS:
        print(f"TCP_POS|{x},{y},{z}")
        await socket.send(f"TCP_POS|{x},{y},{z}")
    return ""


async def start_websocket_server():
    async with websockets.serve(ws_handler, "localhost", 8765):
        print("WebSocket server running on ws://localhost:8765")
        await asyncio.Future()  # run forever

async def start_fastapi():
    # uvicorn.run("main:app", host="127.0.0.1", port=8000, loop="none")
    config = uvicorn.Config("main:app", host="127.0.0.1", port=8000, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


# --- Static File Serving & Entrypoint ---

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="root")

async def main():
    ws_task = asyncio.create_task(start_websocket_server())
    mcp.settings.port = 8001
    api_task = asyncio.create_task(mcp.run_streamable_http_async())

    webserver = asyncio.create_task(start_fastapi())

    await asyncio.gather(ws_task, api_task, webserver)

if __name__ == "__main__":
    # uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
    asyncio.run(main())
