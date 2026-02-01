import os

from fastapi.staticfiles import StaticFiles
import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from typing import List, TypedDict, Set

from contextlib import asynccontextmanager

import sys
# Enforce Python 3.12 at runtime because Open3D currently requires Python 3.12.x
if (sys.version_info.major, sys.version_info.minor) != (3, 12):
    raise RuntimeError(f"Python 3.12.x is required for Open3D compatibility. Running Python {sys.version_info.major}.{sys.version_info.minor}.")

import opcua
import mcp_server
import WorkSpace


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

app.include_router(opcua.router)
app.include_router(mcp_server.router)
app.include_router(WorkSpace.router)

app.mount("/llm", mcp_server.mcp_app)

# --- Static File Serving & Entrypoint ---
if os.getenv("HOST"):
    app.mount("/", StaticFiles(directory="./www", html=True), name="root")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
    # asyncio.run(main())
