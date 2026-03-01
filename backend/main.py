"""
FastAPI entrypoint that stitches together the OPC UA routes, WebSocket router, and the MCP tool server.

- Shares a lifespan with the MCP app so both start/stop together and so socket state can be shared.
- Restricts CORS to the frontend dev origin.
"""

import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from typing import List, TypedDict, Set

from contextlib import asynccontextmanager

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
app.include_router(endpoints.router)  # REST endpoints for OPC UA browsing
app.include_router(mcp.router)
app.mount("/llm", mcp.mcp_app)

# --- Static File Serving & Entrypoint ---

# app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="root")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
    # asyncio.run(main())
