from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from wsc2_backend.models.robot import RobotConnectionStatus, RobotSessionInfo
from wsc2_backend.models.server import ServerSessionInfo, ServerStatus

from .robot_session import RobotSession


@dataclass
class ServerSession:
    """Runtime state for one OPC UA server connection."""

    server_url: str
    status: ServerStatus = ServerStatus.DISCONNECTED
    namespace_uris: list[str] = field(default_factory=list)
    is_robotics_server: bool = False
    robots_by_id: dict[str, RobotSession] = field(default_factory=dict)
    connection: Any | None = None

    def to_info(self) -> ServerSessionInfo:
        return ServerSessionInfo(
            server_url=self.server_url,
            status=self.status,
            namespace_uris=self.namespace_uris,
            is_robotics_server=self.is_robotics_server,
            robot_ids=list(self.robots_by_id),
        )

    def mark_connected(
        self,
        *,
        namespace_uris: list[str] | None = None,
        is_robotics_server: bool | None = None,
    ) -> None:
        self.status = ServerStatus.CONNECTED
        if namespace_uris is not None:
            self.namespace_uris = namespace_uris
        if is_robotics_server is not None:
            self.is_robotics_server = is_robotics_server

    def register_robot(self, robot_info: RobotSessionInfo) -> RobotSession:
        robot = self.robots_by_id.get(robot_info.robot_id)
        if robot is None:
            robot = RobotSession(info=robot_info)
            self.robots_by_id[robot.robot_id] = robot
        else:
            robot.info = robot_info

        robot.set_status(RobotConnectionStatus.CONNECTED)
        return robot

    def replace_robots(self, robots: list[RobotSessionInfo]) -> list[RobotSession]:
        self.robots_by_id = {}
        return [self.register_robot(robot) for robot in robots]

    def get_robot(self, robot_id: str) -> RobotSession | None:
        return self.robots_by_id.get(robot_id)

    async def disconnect(self) -> None:
        if self.connection is not None:
            await self.connection.disconnect()
        self.status = ServerStatus.DISCONNECTED
