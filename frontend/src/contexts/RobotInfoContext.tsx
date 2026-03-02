import { createContext, useContext, useState, type ReactNode } from 'react';

export type AxleValues = Record<string, number>;

export interface RobotInfo {
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  gotoMethodNodeId?: string;
  toggleEndEffMethodNodeId?: string | null;
}

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
};

export const RobotInfoContext = createContext<RobotInfoContextType | undefined>(undefined);

export function RobotInfoProvider({ children }: { children: ReactNode }) {
  const [robotName, setRobotName] = useState<string | null>(null);
  const [robotStatus, setRobotStatus] = useState<string | null>(null);
  const [robotMode, setRobotMode] = useState<string | null>(null);
  const [axleValues, setAxleValues] = useState<AxleValues | null>(null);
  const [orderedJointNames, setOrderedJointNames] = useState<string[]>([]);
  const [gotoMethodNodeId, setGotoMethodNodeId] = useState<string | null>(null);
  const [robotInfo, setRobotInfo] = useState<RobotInfo | null>(null);
  const [opcuaJointLength, setOpcuaJointLength] = useState<number | null>(null);

  return (
    <RobotInfoContext.Provider
      value={{
        robotName,
        setRobotName,
        robotStatus,
        setRobotStatus,
        robotMode,
        setRobotMode,
        axleValues,
        setAxleValues,
        orderedJointNames,
        setOrderedJointNames,
        gotoMethodNodeId,
        setGotoMethodNodeId,
        robotInfo,
        setRobotInfo,
        opcuaJointLength,
        setOpcuaJointLength,
      }}
    >
      {children}
    </RobotInfoContext.Provider>
  );
}

export function useRobotInfoContext() {
  const ctx = useContext(RobotInfoContext);
  if (!ctx) throw new Error('useRobotInfoContext must be used within RobotInfoProvider');
  return ctx;
}
