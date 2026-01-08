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
  solveStatuses: number[];
  setSolveStatuses: (statuses: number[]) => void;
  solveStatusText: string;
}

export function useJointState(options: UseJointStateOptions = {}): JointStateApi {
  const { initialAngles = [], initialFkMode = false } = options;
  const [jointAngles, setJointAngles] = useState<number[]>([...initialAngles]);
  const [fkMode, setFkMode] = useState<boolean>(initialFkMode);
  const [solveStatuses, setSolveStatusesState] = useState<number[]>([]);

  // Lookup map from solver status enum to readable labels
  const statusLookup = useMemo(() => {
    const entries = Object.entries(SOLVE_STATUS) as Array<[keyof typeof SOLVE_STATUS, number]>;
    const lookup: Record<number, string> = {};
    entries.forEach(([label, value]) => {
      lookup[value] = label;
    });
    return lookup;
  }, []);

  const solveStatusText = useMemo(() => {
    return solveStatuses.length
      ? solveStatuses.map((status) => statusLookup[status] ?? `UNKNOWN(${status})`).join(", ")
      : "n/a";
  }, [solveStatuses, statusLookup]);

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

  const setSolveStatuses = useCallback((statuses: number[]) => {
    setSolveStatusesState(statuses);
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
      solveStatuses,
      setSolveStatuses,
      solveStatusText,
    }),
    [jointAngles, fkMode, toggleMode, setFkJoint, setIkJoint, solveStatuses, setSolveStatuses, solveStatusText]
  );
}
