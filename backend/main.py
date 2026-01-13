import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from typing import List, TypedDict, Set

from contextlib import asynccontextmanager

import opcua
import mcp_server


class State(TypedDict):
    mcp_sockets: Set[WebSocket]


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    # Startup
    print("Starting up the app...")
    # Initialize database, cache, etc.
    yield
    # Shutdown
    print("Shutting down the app...")

@asynccontextmanager
async def combined_lifespan(app: FastAPI):
    # Run both lifespans
    async with app_lifespan(app):
        async with mcp_server.mcp_app.lifespan(app):
            # app.state.mcp_sockets = set()
            mcp_server.mcp_app.state.mcp_sockets = set()
            yield # {"mcp_sockets", set()}


# --- App Setup ---

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

app.include_router(opcua.router)
app.include_router(mcp_server.router)
app.mount("/llm", mcp_server.mcp_app)

# --- Static File Serving & Entrypoint ---

# app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="root")

@app.get("/device_set_json")
async def get_device_set_json(url: str):
    """Returns the complete DeviceSet tree as JSON."""
    from fastapi.responses import JSONResponse
    
    client = opcua.get_client(url)
    if not client:
        return JSONResponse(
            status_code=404,
            content={"error": f"No OPC UA client connected for URL: {url}"}
        )
    try:
        root = client.client.get_root_node()
        from modules.GetAddressSpace import collect_node_details
        detailed = await collect_node_details(root, children_depth=2)
        return JSONResponse(content=detailed)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/node_json")
async def get_node_json(url: str, nodeid: str):
    """Returns details of a single node as JSON."""
    from fastapi.responses import JSONResponse
    
    client = opcua.get_client(url)
    if not client:
        return JSONResponse(
            status_code=404,
            content={"error": "No OPC UA client for this URL"}
        )
    try:
        node = client.client.get_node(nodeid)
        from modules.GetAddressSpace import collect_node_details
        detail = await collect_node_details(node, children_depth=0)
        return JSONResponse(content=detail)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/subtree_children_json")
async def get_subtree_children_json(url: str, nodeid: str):
    """Returns the children of a node as JSON."""
    from fastapi.responses import JSONResponse
    
    client = opcua.get_client(url)
    if not client:
        return JSONResponse(
            status_code=404,
            content={"error": f"No OPC UA client connected for URL: {url}"}
        )
    try:
        node = client.client.get_node(nodeid)
        from modules.GetAddressSpace import collect_node_details
        detailed = await collect_node_details(node, children_depth=2)
        return JSONResponse(content=detailed)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
    # asyncio.run(main())
