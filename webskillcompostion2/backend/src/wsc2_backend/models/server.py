from __future__ import annotations

from enum import StrEnum

from pydantic import Field

from .base import ContractModel


class ServerStatus(StrEnum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    ERROR = "error"


class ServerSessionInfo(ContractModel):
    server_url: str
    status: ServerStatus = ServerStatus.DISCONNECTED
    namespace_uris: list[str] = Field(default_factory=list)
    is_robotics_server: bool = False
    robot_ids: list[str] = Field(default_factory=list)

