from __future__ import annotations

from fastapi import FastAPI

from wsc2_backend.services.runtime_registry import RuntimeRegistry
from wsc2_backend.websocket.router import websocket_endpoint


def create_app() -> FastAPI:
    app = FastAPI(title="WebSkillComposition 2 Backend")
    app.state.registry = RuntimeRegistry()
    app.add_api_websocket_route("/ws", websocket_endpoint)
    return app


app = create_app()


def main() -> None:
    import uvicorn

    uvicorn.run("wsc2_backend.app:app", host="127.0.0.1", port=8000)
