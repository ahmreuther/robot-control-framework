from __future__ import annotations
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.services.runtime_registry import RuntimeRegistry
from backend.websocket.router import websocket_endpoint
from backend.websocket.surface_router import websocket_surface_endpoint


def create_app() -> FastAPI:
    app = FastAPI(title="WebSkillComposition 2 Backend")
    app.state.registry = RuntimeRegistry()
    app.add_api_websocket_route("/ws", websocket_endpoint)
    app.add_api_websocket_route("/ws/surface", websocket_surface_endpoint)

    if os.getenv("HOST"):
        app.mount("/", StaticFiles(directory="./www", html=True), name="root")

    return app


app = create_app()


def main() -> None:
    import uvicorn

    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000)
