import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRobotControl } from "./RobotControlContext";
import { JOINT_SOURCE_ID, type JointSourceId } from "../model/jointStateManager";

interface RobotManipulationState {
  robotId: string;
  sourceId: JointSourceId;
  initialAngles: number[];
  syncMode: boolean;
}

interface RobotInteractionContextValue {
  getHighlightedJointName(robotId: string): string | null;
  setHighlightedJointName(robotId: string, jointName: string | null): void;
  manipulation: RobotManipulationState | null;
  isAbortAreaHovered: boolean;
  beginManipulation(robotId: string, sourceId: JointSourceId): void;
  endManipulation(options?: { cancel?: boolean }): void;
  setAbortAreaHovered(hovered: boolean): void;
}

const RobotInteractionContext =
  createContext<RobotInteractionContextValue | null>(null);

export interface RobotInteractionProviderProps {
  children: ReactNode;
}

export function RobotInteractionProvider({
  children,
}: RobotInteractionProviderProps) {
  const { controller, getJointManager, isSyncing } = useRobotControl();
  const [highlightedJointNameByRobotId, setHighlightedJointNameByRobotId] =
    useState<Record<string, string | null>>({});
  const [manipulation, setManipulation] = useState<RobotManipulationState | null>(
    null,
  );
  const [isAbortAreaHovered, setAbortAreaHovered] = useState(false);

  const setHighlightedJointName = useCallback(
    (robotId: string, jointName: string | null) => {
      setHighlightedJointNameByRobotId((current) => {
        if ((current[robotId] ?? null) === jointName) {
          return current;
        }
        return {
          ...current,
          [robotId]: jointName,
        };
      });
    },
    [],
  );

  const beginManipulation = useCallback(
    (robotId: string, sourceId: JointSourceId) => {
      setManipulation((current) => {
        if (current?.robotId === robotId && current.sourceId === sourceId) {
          return current;
        }
        const manager = getJointManager(robotId);
        if (!manager) {
          return current;
        }

        controller.getJointRuntime().beginManipulation(robotId, sourceId);
        return {
          robotId,
          sourceId,
          initialAngles: manager.getAngles(),
          syncMode: isSyncing(robotId),
        };
      });
    },
    [controller, getJointManager, isSyncing],
  );

  const endManipulation = useCallback(
    (options?: { cancel?: boolean }) => {
      setManipulation((current) => {
        if (!current) {
          return current;
        }
        controller.getJointRuntime().endManipulation(current.robotId, current.sourceId, {
          cancel: options?.cancel,
          restoreAngles: current.initialAngles,
        });
        setAbortAreaHovered(false);
        return null;
      });
    },
    [controller],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (!manipulation?.syncMode) {
        return;
      }
      endManipulation({ cancel: true });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [endManipulation, manipulation?.syncMode]);

  const value = useMemo<RobotInteractionContextValue>(
    () => ({
      getHighlightedJointName(robotId: string) {
        return highlightedJointNameByRobotId[robotId] ?? null;
      },
      setHighlightedJointName,
      manipulation,
      isAbortAreaHovered,
      beginManipulation,
      endManipulation,
      setAbortAreaHovered,
    }),
    [
      beginManipulation,
      endManipulation,
      highlightedJointNameByRobotId,
      isAbortAreaHovered,
      manipulation,
      setHighlightedJointName,
    ],
  );

  return (
    <RobotInteractionContext.Provider value={value}>
      {children}
    </RobotInteractionContext.Provider>
  );
}

export function useRobotInteraction(): RobotInteractionContextValue {
  const context = useContext(RobotInteractionContext);
  if (!context) {
    throw new Error(
      "useRobotInteraction must be used within a RobotInteractionProvider.",
    );
  }
  return context;
}
