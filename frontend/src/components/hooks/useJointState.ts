import { useCallback, useMemo, useState } from "react";

export interface UseJointStateOptions {
  initialAngles?: number[];
  initialFkMode?: boolean;
}

export interface JointStateApi {
  jointAngles: number[];
  fkMode: boolean;
  setFkMode: (mode: boolean) => void;
  setFkJoint: (index: number, value: number) => void;
  setIkJoint: (angles: number[]) => void;
}

export function useJointState(options: UseJointStateOptions = {}): JointStateApi {
  const { initialAngles = [], initialFkMode = false } = options;
  const [jointAngles, setJointAngles] = useState<number[]>([...initialAngles]);
  const [fkMode, setFkMode] = useState<boolean>(initialFkMode);

  // useCallback wrappers make robot angles more stable
  const setFkJoint = useCallback((index: number, value: number) => {
    setFkMode(true);
    setJointAngles((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, [setFkMode, setJointAngles]);

  const setIkJoint = useCallback((angles: number[]) => {
    setJointAngles(angles);
  }, [setJointAngles]);
  
  return useMemo(
    () => ({
      jointAngles,
      fkMode,
      setFkMode,
      setFkJoint,
      setIkJoint,
    }),
    [jointAngles, fkMode, setFkJoint, setIkJoint]
  );
}
