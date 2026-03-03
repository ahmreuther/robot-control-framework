import { createContext, type PropsWithChildren, useContext } from 'react';

import useServersAndRobots, { type Robot, type Server } from '../../../features/server-management/hooks';

interface ServersContextType {
  servers: Server[];
  robots: Robot[];
  addServer: (name: string, connectedUrl: string, backendport: string | null) => number;
  removeServer: (id: number) => void;
  addRobot: (name: string) => number;
  removeRobot: (id: number) => void;
  connectRobotToServer: (robotId: number, serverId: number) => void;
  disconnectRobot: (robotId: number) => void;
  activeASpaceServerId: number | null;
  setActiveASpaceServerId: (id: number | null) => void;
  activeRuntimeServerId: number | null;
  setActiveRuntimeServerId: (id: number | null) => void;
  updateServerConnectedUrl: (serverId: number, connectedUrl: string | null) => void;
  updateServerConnectionStatus: (serverId: number, isConnected: boolean) => void;
  findServerById: (serverId: number | null) => Server | null;
}

const ServersContext = createContext<ServersContextType | undefined>(undefined);

export function ServersProvider({ children }: PropsWithChildren) {
  const state = useServersAndRobots();

  const findServerById = (serverId: number | null) => {
    if (serverId === null) {
      return null;
    }

    return state.servers.find((server) => server.id === serverId) ?? null;
  };

  return (
    <ServersContext.Provider
      value={{
        ...state,
        findServerById,
      }}
    >
      {children}
    </ServersContext.Provider>
  );
}

export function useServersContext() {
  const context = useContext(ServersContext);
  if (!context) {
    throw new Error('useServersContext must be used within a ServersProvider');
  }

  return context;
}
