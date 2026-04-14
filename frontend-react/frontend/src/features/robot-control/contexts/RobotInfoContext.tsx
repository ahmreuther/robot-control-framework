import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { useServersContext } from '../../server-management/contexts/ServersContext';

export type AxleValues = Record<string, number>;

export interface RobotInfo {
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  gotoMethodNodeId?: string;
  toggleEndEffMethodNodeId?: string | null;
}

interface ServerRobotRuntimeState {
  robotName: string | null;
  robotStatus: string | null;
  robotMode: string | null;
  axleValues: AxleValues | null;
  orderedJointNames: string[];
  gotoMethodNodeId: string | null;
  robotInfo: RobotInfo | null;
  opcuaJointLength: number | null;
}

type ServerStatePatch = Partial<ServerRobotRuntimeState>;

type RobotInfoContextType = {
  robotName: string | null;
  setRobotName: (robotName: string | null) => void;

  robotStatus: string | null;
  setRobotStatus: (robotStatus: string | null) => void;

  robotMode: string | null;
  setRobotMode: (robotMode: string | null) => void;

  axleValues: AxleValues | null;
  setAxleValues: (axleValues: AxleValues | null) => void;

  orderedJointNames: string[];
  setOrderedJointNames: (orderedJointNames: string[]) => void;

  gotoMethodNodeId: string | null;
  setGotoMethodNodeId: (gotoMethodNodeId: string | null) => void;

  robotInfo: RobotInfo | null;
  setRobotInfo: (robotInfo: RobotInfo | null) => void;

  opcuaJointLength: number | null;
  setOpcuaJointLength: (value: number | null) => void;

  getServerRobotState: (serverId: number | null) => ServerRobotRuntimeState;
  updateServerRobotState: (serverId: number, patch: ServerStatePatch) => void;
  resetServerRobotState: (serverId: number) => void;
};

const createDefaultServerState = (): ServerRobotRuntimeState => ({
  robotName: null,
  robotStatus: null,
  robotMode: null,
  axleValues: null,
  orderedJointNames: [],
  gotoMethodNodeId: null,
  robotInfo: null,
  opcuaJointLength: null,
});

export const RobotInfoContext = createContext<RobotInfoContextType | undefined>(undefined);

export function RobotInfoProvider({ children }: { children: ReactNode }) {
  const { activeRuntimeServerId, activeASpaceServerId } = useServersContext();
  const [serverStateById, setServerStateById] = useState<Record<number, ServerRobotRuntimeState>>({});

  const currentServerId = activeRuntimeServerId ?? activeASpaceServerId;

  const getServerRobotState = useCallback(
    (serverId: number | null) => {
      if (serverId === null) {
        return createDefaultServerState();
      }

      return serverStateById[serverId] ?? createDefaultServerState();
    },
    [serverStateById],
  );

  const updateServerRobotState = useCallback((serverId: number, patch: ServerStatePatch) => {
    setServerStateById((prev) => ({
      ...prev,
      [serverId]: {
        ...(prev[serverId] ?? createDefaultServerState()),
        ...patch,
      },
    }));
  }, []);

  const resetServerRobotState = useCallback((serverId: number) => {
    setServerStateById((prev) => ({
      ...prev,
      [serverId]: createDefaultServerState(),
    }));
  }, []);

  const currentState = getServerRobotState(currentServerId);

  const updateCurrentState = useCallback(
    (patch: ServerStatePatch) => {
      if (currentServerId === null) {
        return;
      }

      updateServerRobotState(currentServerId, patch);
    },
    [currentServerId, updateServerRobotState],
  );

  const value = useMemo<RobotInfoContextType>(
    () => ({
      robotName: currentState.robotName,
      setRobotName: (robotName) => updateCurrentState({ robotName }),

      robotStatus: currentState.robotStatus,
      setRobotStatus: (robotStatus) => updateCurrentState({ robotStatus }),

      robotMode: currentState.robotMode,
      setRobotMode: (robotMode) => updateCurrentState({ robotMode }),

      axleValues: currentState.axleValues,
      setAxleValues: (axleValues) => updateCurrentState({ axleValues }),

      orderedJointNames: currentState.orderedJointNames,
      setOrderedJointNames: (orderedJointNames) => updateCurrentState({ orderedJointNames }),

      gotoMethodNodeId: currentState.gotoMethodNodeId,
      setGotoMethodNodeId: (gotoMethodNodeId) => updateCurrentState({ gotoMethodNodeId }),

      robotInfo: currentState.robotInfo,
      setRobotInfo: (robotInfo) => updateCurrentState({ robotInfo }),

      opcuaJointLength: currentState.opcuaJointLength,
      setOpcuaJointLength: (opcuaJointLength) => updateCurrentState({ opcuaJointLength }),

      getServerRobotState,
      updateServerRobotState,
      resetServerRobotState,
    }),
    [currentState, getServerRobotState, resetServerRobotState, updateCurrentState, updateServerRobotState],
  );

  return <RobotInfoContext.Provider value={value}>{children}</RobotInfoContext.Provider>;
}

export function useRobotInfoContext() {
  const ctx = useContext(RobotInfoContext);
  if (!ctx) {
    throw new Error('useRobotInfoContext must be used within RobotInfoProvider');
  }
  return ctx;
}
