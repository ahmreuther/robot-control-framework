import { createContext, useContext, type PropsWithChildren } from "react";

type AxleValues = Record<string, number>;

type RobotInfo = {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    gotoMethodNodeId?: string;
    toggleEndEffMethodNodeId?: string | null;
};


type RobotInfoContextType = {
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

  debugInfo: string | null;
  setDebugInfo: (debugInfo: string | null) => void;

};

export const RobotInfoContext = createContext<RobotInfoContextType>({
  robotName: '-',
  setRobotName: () => {},

  robotStatus: 'Not Connected',
  setRobotStatus: () => {},

  robotMode: '-',
  setRobotMode: () => {},

  axleValues: {},
  setAxleValues: () => {},

  robotInfo: {},
  setRobotInfo: () => {},

  debugInfo: 'Initializing...',
  setDebugInfo: () => {},
  
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

  readonly debugInfo: string | null;
  readonly setDebugInfo: (debugInfo: string | null) => void;
}>;

export function RobotInfoProvider(props: RobotInfoProviderProps) {
  return (
    <RobotInfoContext.Provider value={{ robotName: props.robotName, setRobotName: props.setRobotName 
        ,robotStatus: props.robotStatus, setRobotStatus: props.setRobotStatus 
        ,robotMode: props.robotMode, setRobotMode: props.setRobotMode
        ,axleValues: props.axleValues, setAxleValues: props.setAxleValues
        ,robotInfo: props.robotInfo, setRobotInfo: props.setRobotInfo
        ,debugInfo: props.debugInfo, setDebugInfo: props.setDebugInfo
    }}>
      {props.children}
    </RobotInfoContext.Provider>
  );
}

export function useRobotInfoContext() {
  const context = useContext(RobotInfoContext);
  if (!context) {
    throw new Error("useUrlContext must be used within a RobotInfoProvider");
  }
  return context;
}
