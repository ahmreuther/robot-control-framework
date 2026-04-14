import { useState } from 'react';

export interface Robot {
  id: number;
  name: string;
  serverId: number | null;
}
export interface Server {
  id: number;
  name: string;
  robotIds: number[];
  connectedUrl: string | null;
  backendport: string | null;
  isConnected: boolean;
}

export default function useServersAndRobots() {
  const [servers, setServers] = useState<Server[]>([]);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [serverIdCounter, setServerIdCounter] = useState(1);
  const [robotIdCounter, setRobotIdCounter] = useState(1);
  const [activeASpaceServerId, setActiveASpaceServerId] = useState<number | null>(null);
  const [activeRuntimeServerId, setActiveRuntimeServerId] = useState<number | null>(null);

  const addServer = (name: string, connectedUrl: string, backendport: string | null = null) => {
    const id = serverIdCounter;
    setServers((prev) => [...prev, { id, name, robotIds: [], connectedUrl, backendport, isConnected: false }]);
    setServerIdCounter((id) => id + 1);
    setActiveASpaceServerId(id);
    return id;
  };

  const removeServer = (serverId: number) => {
    setServers((prev) => prev.filter((s) => s.id !== serverId));
    setRobots((prev) => prev.map((r) => (r.serverId === serverId ? { ...r, serverId: null } : r)));
    setActiveASpaceServerId((prev) => (prev === serverId ? null : prev));
    setActiveRuntimeServerId((prev) => (prev === serverId ? null : prev));
  };

  const addRobot = (name: string) => {
    const id = robotIdCounter;
    setRobots((prev) => [...prev, { id, name, serverId: null }]);
    setRobotIdCounter((id) => id + 1);
    return id;
  };

  const removeRobot = (robotId: number) => {
    setRobots((prev) => prev.filter((r) => r.id !== robotId));
    setServers((prev) =>
      prev.map((s) => ({ ...s, robotIds: s.robotIds.filter((id) => id !== robotId) })),
    );
  };

  const connectRobotToServer = (robotId: number, serverId: number) => {
    const prevRobot = robots.find((r) => r.id === robotId);
    const prevServerId = prevRobot?.serverId ?? null;

    setRobots((prev) => prev.map((r) => (r.id === robotId ? { ...r, serverId } : r)));
    setServers((prev) =>
      prev.map((s) => {
        if (s.id === serverId) {
          // avoid duplicates
          return {
            ...s,
            robotIds: s.robotIds.includes(robotId) ? s.robotIds : [...s.robotIds, robotId],
          };
        } else if (s.id === prevServerId) {
          return { ...s, robotIds: s.robotIds.filter((id) => id !== robotId) };
        } else {
          return s;
        }
      }),
    );
  };

  const disconnectRobot = (robotId: number) => {
    const robot = robots.find((r) => r.id === robotId);
    if (robot?.serverId === null || !robot) return;
    setRobots((prev) => prev.map((r) => (r.id === robotId ? { ...r, serverId: null } : r)));
    setServers((prev) =>
      prev.map((s) =>
        s.id === robot.serverId ? { ...s, robotIds: s.robotIds.filter((id) => id !== robotId) } : s,
      ),
    );
  };

  const updateServerConnectedUrl = (serverId: number, connectedUrl: string | null) => {
    setServers((prev) =>
      prev.map((server) => (server.id === serverId ? { ...server, connectedUrl } : server)),
    );
  };

  const updateServerConnectionStatus = (serverId: number, isConnected: boolean) => {
    setServers((prev) =>
      prev.map((server) => (server.id === serverId ? { ...server, isConnected } : server)),
    );
  };

  return {
    servers,
    robots,
    addServer,
    removeServer,
    addRobot,
    removeRobot,
    connectRobotToServer,
    disconnectRobot,
    activeASpaceServerId,
    setActiveASpaceServerId,
    activeRuntimeServerId,
    setActiveRuntimeServerId,
    updateServerConnectedUrl,
    updateServerConnectionStatus,
  } as const;
}
