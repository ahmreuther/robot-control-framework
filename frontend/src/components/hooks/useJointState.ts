import { useCallback, useMemo, useState } from "react";
import { SOLVE_STATUS } from "../viewport/Robot";

export interface UseJointStateOptions {
  initialAngles?: number[];
  initialFkMode?: boolean;
}

export interface JointStateApi {
  jointAngles: number[];
  fkMode: boolean;
  setFkMode: (mode: boolean) => void;
  toggleMode: () => void;
  setFkJoint: (index: number, value: number) => void;
  setIkJoint: (angles: number[]) => void;
}

export function useJointState(options: UseJointStateOptions = {}): JointStateApi {
  const { initialAngles = [], initialFkMode = false } = options;
  const [jointAngles, setJointAngles] = useState<number[]>([...initialAngles]);
  const [fkMode, setFkMode] = useState<boolean>(initialFkMode);

  const setFkJoint = useCallback((index: number, value: number) => {
    setFkMode(true);
    setJointAngles((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const setIkJoint = useCallback((angles: number[]) => {
    setJointAngles(angles);
  }, []);

  const toggleMode = useCallback(() => {
    setFkMode((prev) => !prev);
  }, []);

  return useMemo(
    () => ({
      jointAngles,
      fkMode,
      setFkMode,
      toggleMode,
      setFkJoint,
      setIkJoint,
    }),
    [jointAngles, fkMode, toggleMode, setFkJoint, setIkJoint]
  );
}
