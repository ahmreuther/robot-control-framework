import os
import sys

from fastapi.staticfiles import StaticFiles
import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from typing import List, TypedDict, Set

from contextlib import asynccontextmanager
# Note: Keep runtime compatible with the project's declared Python range.
# Dependency installation (uv/pip) will fail early if an incompatible Python version is used.

BACKEND_ROOT = os.path.dirname(__file__)
SRC_ROOT = os.path.join(BACKEND_ROOT, "src")
if SRC_ROOT not in sys.path:
    sys.path.insert(0, SRC_ROOT)

import WorkSpace
from dt_robot_control.opcua import endpoints
import dt_robot_control.server.mcp as mcp
from dt_robot_control.websocket import router as ws_router


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
    # Run both lifespans; also initialize shared MCP socket state.
    async with app_lifespan(app):
        async with mcp.mcp_app.lifespan(app):
            # app.state.mcp_sockets = set()
            mcp.mcp_app.state.mcp_sockets = set()
            yield # {"mcp_sockets", set()}


# --- App Setup ---

app = FastAPI(lifespan=combined_lifespan)

origins = [
    "http://localhost:1234",
    "http://127.0.0.1:1234",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router.router)  # WebSocket endpoints
app.include_router(endpoints.router)  # REST endpoints for OPC UA browsing
app.include_router(mcp.router)
app.mount("/llm", mcp.mcp_app)
app.include_router(WorkSpace.router)

# --- Static File Serving & Entrypoint ---
if os.getenv("HOST"):
    app.mount("/", StaticFiles(directory="./www", html=True), name="root")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
    # asyncio.run(main())
