import { createContext, type PropsWithChildren, useContext } from 'react';

export type AxleValues = Record<string, number>;

export interface RobotInfo {
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  gotoMethodNodeId?: string;
  toggleEndEffMethodNodeId?: string | null;
}

interface RobotInfoContextType {
  robotName: string | null;
  setRobotName: (robotName: string | null) => void;

  robotStatus: string | null;
  setRobotStatus: (robotStatus: string | null) => void;

  robotMode: string | null;
  setRobotMode: (robotMode: string | null) => void;

  axleValues: AxleValues | null;
  setAxleValues: (axleValues: AxleValues | null) => void;

  robotInfo: RobotInfo | null;
  setRobotInfo: (robotInfo: RobotInfo | null) => void;
}

export const RobotInfoContext = createContext<RobotInfoContextType>({
  robotName: null,
  setRobotName: () => {},

  robotStatus: 'Not Connected',
  setRobotStatus: () => {},

  robotMode: null,
  setRobotMode: () => {},

  axleValues: {},
  setAxleValues: () => {},

  robotInfo: {},
  setRobotInfo: () => {},
});

export type RobotInfoProviderProps = PropsWithChildren<{
  readonly robotName: string | null;
  readonly setRobotName: (robotName: string | null) => void;

  readonly robotStatus: string | null;
  readonly setRobotStatus: (robotStatus: string | null) => void;

  readonly robotMode: string | null;
  readonly setRobotMode: (robotMode: string | null) => void;

  readonly axleValues: AxleValues | null;
  readonly setAxleValues: (axleValues: AxleValues | null) => void;

  readonly robotInfo: RobotInfo | null;
  readonly setRobotInfo: (robotInfo: RobotInfo | null) => void;
}>;

export function RobotInfoProvider(props: RobotInfoProviderProps) {
  return (
    <RobotInfoContext.Provider
      value={{
        robotName: props.robotName,
        setRobotName: props.setRobotName,
        robotStatus: props.robotStatus,
        setRobotStatus: props.setRobotStatus,
        robotMode: props.robotMode,
        setRobotMode: props.setRobotMode,
        axleValues: props.axleValues,
        setAxleValues: props.setAxleValues,
        robotInfo: props.robotInfo,
        setRobotInfo: props.setRobotInfo,
      }}
    >
      {props.children}
    </RobotInfoContext.Provider>
  );
}

export function useRobotInfoContext() {
  const context = useContext(RobotInfoContext);
  if (!context) {
    throw new Error('useRobotContext must be used within a RobotInfoProvider');
  }
  return context;
}
