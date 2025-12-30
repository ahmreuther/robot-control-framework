import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from typing import List, TypedDict, Set

from contextlib import asynccontextmanager

from dt_robot_control.opcua import opcua_nodes
import dt_robot_control.server.mcp_server as mcp_server
from dt_robot_control.api.websocket import router as ws_router


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
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Router Configuration ---

app.include_router(ws_router.router)  # WebSocket endpoints
app.include_router(opcua_nodes.router)  # REST endpoints for OPC UA browsing
app.include_router(mcp_server.router)
app.mount("/llm", mcp_server.mcp_app)

# --- Static File Serving & Entrypoint ---

# app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="root")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
    # asyncio.run(main())
