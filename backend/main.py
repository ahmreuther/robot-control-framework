import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from typing import List, TypedDict, Set

from contextlib import asynccontextmanager
import os

import src.opcua.opcua as opcua
import src.server.mcp_server as mcp_server


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

# Feature flag: Switch between old and new WebSocket router implementation
# Old: WebSocket handlers inline in src/opcua/opcua.py (original implementation)
# New: WebSocket handlers extracted to src/api/websocket/ (refactored implementation)
# Usage: Set environment variable USE_NEW_WEBSOCKET=true to test the new router
# Once validated, remove this flag and keep only the new router
USE_NEW_WEBSOCKET = os.getenv("USE_NEW_WEBSOCKET", "false") == "true"

if USE_NEW_WEBSOCKET:
    # Use refactored WebSocket router (handlers extracted to src/api/websocket/)
    from src.api.websocket import router as ws_router
    app.include_router(ws_router.router)
    # Still need opcua router for REST endpoints (browsing nodes, etc.)
    app.include_router(opcua.router)
else:
    # Use original implementation (WebSocket + REST endpoints in src/opcua/opcua.py)
    app.include_router(opcua.router)
app.include_router(mcp_server.router)
app.mount("/llm", mcp_server.mcp_app)

# --- Static File Serving & Entrypoint ---

# app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="root")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
    # asyncio.run(main())
