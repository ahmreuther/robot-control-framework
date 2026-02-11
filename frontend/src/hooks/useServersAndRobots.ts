import { useEffect, useState } from 'react';

export type Robot = { id: number; name: string; serverId: number | null };
export type Server = { id: number; name: string; robotIds: number[]; connectedUrl: string | null; backendport: string | null };

export default function useServersAndRobots() {
  const [servers, setServers] = useState<Server[]>([]);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [serverIdCounter, setServerIdCounter] = useState(1);
  const [robotIdCounter, setRobotIdCounter] = useState(1);

  const addServer = (name: string, connectedUrl: string, backendport: string | null = null) => {
    const id = serverIdCounter;
    setServers(prev => [...prev, { id, name, robotIds: [], connectedUrl, backendport }]);
    setServerIdCounter(id => id + 1);
    return id;
  };

  const removeServer = (serverId: number) => {
    setServers(prev => prev.filter(s => s.id !== serverId));
    setRobots(prev => prev.map(r => r.serverId === serverId ? { ...r, serverId: null } : r));
  };

  const addRobot = (name: string) => {
    const id = robotIdCounter;
    setRobots(prev => [...prev, { id, name, serverId: null }]);
    setRobotIdCounter(id => id + 1);
    return id;
  };

  const removeRobot = (robotId: number) => {
    setRobots(prev => prev.filter(r => r.id !== robotId));
    setServers(prev => prev.map(s => ({ ...s, robotIds: s.robotIds.filter(id => id !== robotId) })));
  };

  const connectRobotToServer = (robotId: number, serverId: number) => {
    const prevRobot = robots.find(r => r.id === robotId);
    const prevServerId = prevRobot?.serverId ?? null;

    setRobots(prev => prev.map(r => r.id === robotId ? { ...r, serverId } : r));
    setServers(prev => prev.map(s => {
      if (s.id === serverId) {
        // avoid duplicates
        return { ...s, robotIds: s.robotIds.includes(robotId) ? s.robotIds : [...s.robotIds, robotId] };
      } else if (s.id === prevServerId) {
        return { ...s, robotIds: s.robotIds.filter(id => id !== robotId) };
      } else {
        return s;
      }
    }));
  };

  const disconnectRobot = (robotId: number) => {
    const robot = robots.find(r => r.id === robotId);
    if (!robot || robot.serverId === null) return;
    setRobots(prev => prev.map(r => r.id === robotId ? { ...r, serverId: null } : r));
    setServers(prev => prev.map(s =>
      s.id === robot.serverId
        ? { ...s, robotIds: s.robotIds.filter(id => id !== robotId) }
        : s
    ));
  };

  const [activeASpaceServerId, setActiveASpaceServerId] = useState<number | null>(null);

  useEffect(() => {

    if (activeASpaceServerId !== null && !servers.find(s => s.id === activeASpaceServerId)) {
      setActiveASpaceServerId(null);
    }
  }, [servers, activeASpaceServerId]);

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
  } as const;
}
