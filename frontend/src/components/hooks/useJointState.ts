import { useCallback, useMemo, useState } from "react";

export interface UseJointStateOptions {
  initialAngles?: number[];
  initialFkMode?: boolean;
}

export interface JointStateApi {
  jointAngles: number[];
  fkMode: boolean;
  setFkMode: (mode: boolean) => void;
  setJointsAngles: (angles: number[]) => void;
}

export function useJointState(options: UseJointStateOptions = {}): JointStateApi {
  const { initialAngles = [], initialFkMode = false } = options;
  const [jointAngles, setJointAngles] = useState<number[]>([...initialAngles]);
  const [fkMode, setFkMode] = useState<boolean>(initialFkMode);

  const setJointsAngles = useCallback((angles: number[]) => {
    setJointAngles(angles);
  }, [setJointAngles]);
  
  return useMemo(
    () => ({
      jointAngles,
      fkMode,
      setFkMode,
      setJointsAngles,
    }),
    [jointAngles, fkMode, setJointsAngles]
  );
}
