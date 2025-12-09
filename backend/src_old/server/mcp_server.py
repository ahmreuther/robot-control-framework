from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastmcp import FastMCP, Context
from typing import List


mcp = FastMCP("Robotics MCP Server")

router = APIRouter()

angles = []
tool_center_point = []
tool_center_point_rot = []

target_tcp_pos = None
websockets = set()


# --- WebSocket server ---
@router.websocket("/ws_mcp")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    websockets.add(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # print(data)
            if data.startswith("TCP|"):
                tcp = data.removeprefix("TCP|")
                (tcp_pos, tcp_rot) = tcp.split(";")
                tcp_pos = tcp_pos.removeprefix("Pos:")
                tcp = tcp_pos.strip()
                (x, y, z) = tcp.split(", ")
                print(f"X={x} Y={y} Z={z}")
                global tool_center_point
                tool_center_point = [x, y, z]
                # print(tool_center_point)

                tcp_rot = tcp_rot.removeprefix("Rot:")
                tcp = tcp_rot.strip()
                (a, b, c, d) = tcp.split(", ")
                global tool_center_point_rot
                tool_center_point_rot = [a, b, c, d]
                # print(f"A={a} B={b} C={c} D={d}")
            # await websocket.send(message)
            elif data.startswith("ANGLES|"):
                raw_angles = data.removeprefix("ANGLES|")
                global angles
                angles = []
                for a in raw_angles.split(","):
                    (_, a) = a.split(":")
                    a = a.strip()
                    angles.append(a)
                print(*angles)
    except WebSocketDisconnect:
        pass
    finally:
        websockets.discard(websocket)


@mcp.tool(
    name="get tcp position",
    description="Get the current tcp position of the roboter tool center point based on the fixed coordinate system",
)
def get_tcp(ctx: Context) -> str:
    print(tool_center_point)
    return f"X={tool_center_point[0]}m, Y={tool_center_point[1]}m, Z={tool_center_point[2]}m"


@mcp.tool(
    name="get tcp rotation quarternions",
    description="Get the current tcp rotation of the roboter tool center point in quarternions",
)
def get_tcp_rotation() -> str:
    print(tool_center_point_rot)
    return f"{tool_center_point_rot[0]}, {tool_center_point_rot[1]}, {tool_center_point_rot[2]}, {tool_center_point_rot[3]}"


@mcp.tool(
    name="get joint angles", description="Returns the current joint angles of the robot"
)
def get_joint_angles() -> str:
    angles_str = ""
    for i, a in enumerate(angles):
        angles_str += f"Joint {i + 1}={a}"
    return angles_str


@mcp.tool(
    name="set joint angles", description="Sets the current joint angles of the robot"
)
async def set_joint_angles(joint_angles: List, ctx: Context) -> str:
    socket: WebSocket
    # print("STATE")
    # print(ctx.get_http_request().app.state.mcp_sockets)
    # print(ctx.get_http_request().app.parent_state)
    # print("STATE ENDE")
    # print(ctx.get_http_request().app.)
    for socket in websockets:
        # print(f"TCP_POS|{x},{y},{z}")
        joint_angle_str = ", ".join(map(str, joint_angles))
        print(joint_angle_str)
        await socket.send_text(f"JOINTS|{joint_angle_str}")
    return "success"


@mcp.tool(
    name="set tcp pos",
    description="Sets the tcp position to the parameters based on the fixed coordinate system",
)
async def set_tcp_pos(x, y, z, ctx: Context) -> str:
    print(x, y, z)
    for socket in websockets:
        print(f"TCP_POS|{x},{y},{z}")
        await socket.send_text(f"TCP_POS|{x},{y},{z}")
    return "success"


mcp_app = mcp.http_app(path="/mcp")
