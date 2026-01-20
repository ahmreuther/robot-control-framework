import uvicorn
from typing import Set, TypedDict
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from asyncua import Client
from asyncua.ua.uaerrors import UaError

import opcua
import mcp_server


class State(TypedDict):
    mcp_sockets: Set[WebSocket]


# ---------------- Lifespan ----------------

@asynccontextmanager
async def app_lifespan(app: FastAPI):
    print("Starting up the app...")
    yield
    print("Shutting down the app...")


@asynccontextmanager
async def combined_lifespan(app: FastAPI):
    async with app_lifespan(app):
        async with mcp_server.mcp_app.lifespan(app):
            # init MCP sockets
            mcp_server.mcp_app.state.mcp_sockets = set()
            yield


# ---------------- App Setup ----------------

app = FastAPI(lifespan=combined_lifespan)

origins = [
    "http://localhost:1234",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Keep your routers/mounts
app.include_router(opcua.router)
app.include_router(mcp_server.router)
app.mount("/llm", mcp_server.mcp_app)


# ================================================================================
# LEGACY ENDPOINTS (nicht mehr aktiv genutzt - können entfernt werden)
# ================================================================================

@app.get("/device_set_json")
async def get_device_set_json(url: str):
    """
    Returns the complete DeviceSet tree as JSON (your old method).
    WARNING: can be heavy if depth is large.
    """
    from fastapi.responses import JSONResponse
    client = opcua.get_client(url)
    if not client:
        return JSONResponse(status_code=404, content={"error": f"No OPC UA client connected for URL: {url}"})

    try:
        root = client.client.get_root_node()
        from modules.GetAddressSpace import collect_node_details
        detailed = await collect_node_details(root, children_depth=2)
        return JSONResponse(content=detailed)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/node_json")
async def get_node_json(url: str, nodeid: str):
    from fastapi.responses import JSONResponse
    client = opcua.get_client(url)
    if not client:
        return JSONResponse(status_code=404, content={"error": "No OPC UA client for this URL"})

    try:
        node = client.client.get_node(nodeid)
        from modules.GetAddressSpace import collect_node_details
        detail = await collect_node_details(node, children_depth=0)
        return JSONResponse(content=detail)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/subtree_children_json")
async def get_subtree_children_json(url: str, nodeid: str):
    from fastapi.responses import JSONResponse
    client = opcua.get_client(url)
    if not client:
        return JSONResponse(status_code=404, content={"error": f"No OPC UA client connected for URL: {url}"})

    try:
        node = client.client.get_node(nodeid)
        from modules.GetAddressSpace import collect_node_details
        detailed = await collect_node_details(node, children_depth=2)
        return JSONResponse(content=detailed)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# ================================================================================
# ⭐⭐⭐ RELEVANTE ENDPOINTS FÜR ADDRESS SPACE (Frontend: ASpaceBody.tsx) ⭐⭐⭐
# ================================================================================
#
# Diese Endpoints werden vom Address Space Tree im Frontend verwendet.
# Genutzt in: frontend/src/components/Adressspace/api.ts
#
# ================================================================================

@app.get("/opcua/browse")
async def browse(url: str, node_id: str = "i=84"):
    """
    ⭐ HAUPT-ENDPOINT für Address Space Tree
    
    Gibt die Kinder eines OPC UA Nodes als JSON zurück.
    Wird für Lazy-Loading im Tree verwendet.
    
    Parameter:
        - url: OPC UA Server URL (z.B. "opc.tcp://192.168.1.100:4840")
        - node_id: Node ID (default: "i=84" = Root)
    
    Response:
    {
      "url": "...",
      "nodeId": "...",
      "children": [
        {"nodeId": "...", "browseName": "...", "displayName": "...", "nodeClass": "..."}
      ]
    }
    
    Verwendet in: api.ts → fetchChildren()
    """

    # Option A: Use your existing persistent client if available
    wrapper = None
    try:
        wrapper = opcua.get_client(url)  # may be None if not connected
    except Exception:
        wrapper = None

    # helper to browse using an asyncua client instance
    async def _browse_with_asyncua_client(client: Client):
        node = client.get_node(node_id)
        children = await node.get_children()

        result = []
        for ch in children:
            browse_name = await ch.read_browse_name()
            display_name = await ch.read_display_name()
            node_class = await ch.read_node_class()

            result.append({
                "nodeId": ch.nodeid.to_string(),
                "browseName": f"{browse_name.NamespaceIndex}:{browse_name.Name}",
                "displayName": display_name.Text,
                "nodeClass": node_class.name,  # Object/Variable/Method...
            })

        return {
            "url": url,
            "nodeId": node_id,
            "children": result
        }

    try:
        # If you already maintain a connected client in opcua.get_client(url):
        # We try to reuse it (important for performance and consistency with your WS setup)
        if wrapper is not None and hasattr(wrapper, "client") and wrapper.client is not None:
            # wrapper.client should be an asyncua Client (connected)
            return await _browse_with_asyncua_client(wrapper.client)

        # Option B: fallback – connect per request (works standalone)
        async with Client(url=url) as client:
            return await _browse_with_asyncua_client(client)

    except UaError as e:
        raise HTTPException(status_code=400, detail=f"OPC UA error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {e}")


# ================================================================================


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=False)
    # asyncio.run(main())
