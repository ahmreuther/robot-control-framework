from __future__ import annotations

from wsc2_backend.runtime.robot_session import RobotSession
from wsc2_backend.runtime.server_session import ServerSession


class RuntimeRegistry:
    """Lookup table for connected OPC UA servers and discovered robots."""

    def __init__(self) -> None:
        self._servers_by_url: dict[str, ServerSession] = {}
        self._robots_by_id: dict[str, RobotSession] = {}

    def add_server(self, server: ServerSession) -> None:
        self._servers_by_url[server.server_url] = server
        for robot in server.robots_by_id.values():
            self._robots_by_id[robot.robot_id] = robot

    def ensure_server(self, server_url: str) -> ServerSession:
        server = self.get_server(server_url)
        if server is None:
            server = ServerSession(server_url=server_url)
            self.add_server(server)
        return server

    def get_server(self, server_url: str) -> ServerSession | None:
        return self._servers_by_url.get(server_url)

    def remove_server(self, server_url: str) -> ServerSession | None:
        server = self._servers_by_url.pop(server_url, None)
        if server is None:
            return None

        for robot_id in list(server.robots_by_id):
            self._robots_by_id.pop(robot_id, None)
        return server

    async def disconnect_and_remove_server(self, server_url: str) -> ServerSession | None:
        server = self.get_server(server_url)
        if server is not None:
            await server.disconnect()
        return self.remove_server(server_url)

    def register_robot(self, server_url: str, robot: RobotSession) -> None:
        server = self.ensure_server(server_url)
        server.robots_by_id[robot.robot_id] = robot
        self._robots_by_id[robot.robot_id] = robot

    def replace_server_robots(self, server: ServerSession, robots: list[RobotSession]) -> None:
        for robot_id in list(server.robots_by_id):
            self._robots_by_id.pop(robot_id, None)

        server.robots_by_id = {robot.robot_id: robot for robot in robots}
        for robot in robots:
            self._robots_by_id[robot.robot_id] = robot

    def get_robot(self, robot_id: str) -> RobotSession | None:
        return self._robots_by_id.get(robot_id)

    def clear(self) -> None:
        self._servers_by_url.clear()
        self._robots_by_id.clear()

    @property
    def servers(self) -> dict[str, ServerSession]:
        return self._servers_by_url.copy()

    @property
    def robots(self) -> dict[str, RobotSession]:
        return self._robots_by_id.copy()
