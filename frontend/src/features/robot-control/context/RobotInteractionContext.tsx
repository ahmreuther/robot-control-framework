import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppFeedback } from "../../../app/context/AppFeedbackContext";
import { useRobotControl } from "./RobotControlContext";
import { JOINT_SOURCE_ID, type JointSourceId } from "../model/jointStateManager";

interface RobotManipulationState {
  robotId: string;
  sourceId: JointSourceId;
  syncMode: boolean;
}

interface RobotInteractionContextValue {
  getHighlightedJointName(robotId: string): string | null;
  setHighlightedJointName(robotId: string, jointName: string | null): void;
  manipulation: RobotManipulationState | null;
  isAbortAreaHovered: boolean;
  dragCancelSequence: number;
  ikCancelSequence: number;
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
  const feedback = useAppFeedback();
  const { controller, getJointManager, isSyncing } = useRobotControl();
  const [highlightedJointNameByRobotId, setHighlightedJointNameByRobotId] =
    useState<Record<string, string | null>>({});
  const [manipulation, setManipulation] = useState<RobotManipulationState | null>(
    null,
  );
  const [isAbortAreaHovered, setAbortAreaHovered] = useState(false);
  const [dragCancelSequence, setDragCancelSequence] = useState(0);
  const [ikCancelSequence, setIkCancelSequence] = useState(0);
  const manipulationEndInProgressRef = useRef(false);

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
        if (current && current.robotId !== robotId) {
          return current;
        }
        const manager = getJointManager(robotId);
        if (!manager) {
          return current;
        }

        const next = controller.getJointRuntime().beginManipulation(robotId, sourceId);
        if (!next) {
          return current;
        }
        return {
          robotId: next.robotId,
          sourceId: next.sourceId,
          syncMode: isSyncing(next.robotId),
        };
      });
    },
    [controller, getJointManager, isSyncing],
  );

  const endManipulation = useCallback(
    (options?: { cancel?: boolean }) => {
      if (manipulationEndInProgressRef.current) {
        return;
      }
      manipulationEndInProgressRef.current = true;
      setManipulation((current) => {
        if (!current) {
          return current;
        }
        const runtime = controller.getJointRuntime();
        let cancel = options?.cancel ?? false;
        let preserveAnglesOnResume = false;

        if (current.syncMode && !cancel) {
          const manager = getJointManager(current.robotId);
          const hasMeaningfulChange = runtime.hasMeaningfulManipulationChange(
            current.robotId,
          );
          if (!manager) {
            cancel = true;
          } else if (!hasMeaningfulChange) {
            preserveAnglesOnResume = false;
          } else if (runtime.hasInFlightSyncGoto(current.robotId)) {
            cancel = true;
          } else {
            try {
              const requestId = controller.callRobotGotoForVisualAngles(
                current.robotId,
                manager.getAngles(),
              );
              runtime.markSyncGotoInFlight(current.robotId, requestId);
              preserveAnglesOnResume = true;
            } catch (error) {
              cancel = true;
              feedback.showError("Failed to send robot joints", {
                description:
                  error instanceof Error
                    ? error.message
                    : "Unknown joint command error.",
              });
            }
          }
        }

        runtime.endManipulation(current.robotId, current.sourceId, {
          cancel,
          preserveAnglesOnResume,
        });
        if (cancel && current.sourceId === JOINT_SOURCE_ID.DRAG) {
          setDragCancelSequence((value) => value + 1);
        }
        if (cancel && current.sourceId === JOINT_SOURCE_ID.IK) {
          setIkCancelSequence((value) => value + 1);
        }
        setAbortAreaHovered(false);
        return null;
      });
      queueMicrotask(() => {
        manipulationEndInProgressRef.current = false;
      });
    },
    [controller, feedback, getJointManager],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (
        !manipulation ||
        (manipulation.sourceId !== JOINT_SOURCE_ID.DRAG &&
          manipulation.sourceId !== JOINT_SOURCE_ID.IK)
      ) {
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
      dragCancelSequence,
      ikCancelSequence,
      beginManipulation,
      endManipulation,
      setAbortAreaHovered,
    }),
    [
      beginManipulation,
      endManipulation,
      dragCancelSequence,
      ikCancelSequence,
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
