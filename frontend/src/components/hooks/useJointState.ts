import { useCallback, useMemo, useState } from "react";

export type KinematicsMode = "ik" | "fk";

export interface UseJointStateOptions {
  initialAngles?: number[];
  initialMode?: KinematicsMode;
}

export interface JointStateApi {
  jointAngles: number[];
  mode: KinematicsMode;
  setMode: (mode: KinematicsMode) => void;
  toggleMode: () => void;
  setJoint: (index: number, value: number) => void;
  setAll: (angles: number[]) => void;
  setFromIK: (angles: number[]) => void;
}

const EPS = 1e-6;

const areAnglesEqual = (a: number[], b: number[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i] - b[i]) > EPS) return false;
  }
  return true;
};

export function useJointState(options: UseJointStateOptions = {}): JointStateApi {
  const { initialAngles = [], initialMode = "ik" } = options;
  const [jointAngles, setJointAngles] = useState<number[]>([...initialAngles]);
  const [mode, setMode] = useState<KinematicsMode>(initialMode);

  const replaceAngles = useCallback((next: number[]) => {
    setJointAngles((prev) => (areAnglesEqual(prev, next) ? prev : [...next]));
  }, []);

  const setJoint = useCallback((index: number, value: number) => {
    if (index < 0 || Number.isNaN(value)) return;
    setJointAngles((prev) => {
      const next = [...prev];
      if (index >= next.length) {
        const missing = index - next.length + 1;
        next.push(...Array(missing).fill(0));
      }
      if (Math.abs(next[index] - value) <= EPS) return prev;
      next[index] = value;
      return next;
    });
  }, []);

  const setAll = useCallback((angles: number[]) => {
    if (!Array.isArray(angles)) return;
    replaceAngles(angles);
  }, [replaceAngles]);

  const setFromIK = useCallback((angles: number[]) => {
    setAll(angles);
  }, [setAll]);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "ik" ? "fk" : "ik"));
  }, []);

  return useMemo(
    () => ({ jointAngles, mode, setMode, toggleMode, setJoint, setAll, setFromIK }),
    [jointAngles, mode, setMode, toggleMode, setJoint, setAll, setFromIK]
  );
}
