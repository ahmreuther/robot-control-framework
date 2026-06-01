import { createContext, useContext, useMemo, type ReactNode } from "react";

import type {
  ApplicationController,
  ApplicationSnapshot,
} from "../../../app/model/applicationController";
import type { Robot } from "../../../entities/robot/model/types";
import type {
  RobotPanelState,
  RobotSessionInfo,
} from "../../../entities/robot/model/types";
import type { JointStateManager } from "../model/jointStateManager";
import type { RobotModelConfig, RobotOrigin } from "../model/robotModels";

export interface RobotControlContextValue {
  controller: ApplicationController;
  robots: Robot[];
  activeRobotId: string | null;
  activeRobot: Robot | null;
  motionDevices: RobotSessionInfo[];
  getJointManager(robotId: string): JointStateManager | null;
  getActiveJointManager(): JointStateManager | null;
  isSyncing(robotId: string): boolean;
  createRobot(displayName: string, model: RobotModelConfig, origin: RobotOrigin): string;
  removeRobot(robotId: string): void;
  selectRobot(robotId: string): void;
  bindRobotToMotionDevice(robotId: string, motionDeviceId: string | null): void;
  startRobotSync(robotId: string): void;
  stopRobotSync(robotId: string): void;
  updateRobotPanelState(robotId: string, panel: Partial<RobotPanelState>): void;
  updateRobotHomeAngles(robotId: string, homeAngles: number[]): void;
  updateRobotJointAngles(robotId: string, angles: number[]): boolean;
}

const RobotControlContext = createContext<RobotControlContextValue | null>(null);

export interface RobotControlProviderProps {
  controller: ApplicationController;
  snapshot: ApplicationSnapshot;
  children: ReactNode;
}

export function RobotControlProvider({
  controller,
  snapshot,
  children,
}: RobotControlProviderProps) {
  const value = useMemo<RobotControlContextValue>(() => {
    const robots = Object.values(snapshot.robot.byId);
    const motionDevices = Object.values(snapshot.server.motionDevicesById);
    const activeRobot =
      snapshot.robot.activeRobotId != null
        ? snapshot.robot.byId[snapshot.robot.activeRobotId] ?? null
        : null;

    return {
      controller,
      robots,
      activeRobotId: snapshot.robot.activeRobotId,
      activeRobot,
      motionDevices,
      getJointManager: (robotId: string) =>
        snapshot.robot.byId[robotId]
          ? controller.getJointRuntime().getExistingManager(robotId)
          : null,
      getActiveJointManager: () =>
        snapshot.robot.activeRobotId
          ? controller.getJointRuntime().getExistingManager(
              snapshot.robot.activeRobotId,
            )
          : null,
      isSyncing: (robotId: string) => controller.getJointRuntime().isSyncing(robotId),
      createRobot: (
        displayName: string,
        model: RobotModelConfig,
        origin: RobotOrigin,
      ) => controller.createRobot(displayName, model, origin),
      removeRobot: (robotId: string) => controller.removeRobot(robotId),
      selectRobot: (robotId: string) => controller.selectRobot(robotId),
      bindRobotToMotionDevice: (robotId: string, motionDeviceId: string | null) =>
        controller.bindRobotToMotionDevice(robotId, motionDeviceId),
      startRobotSync: (robotId: string) => {
        controller.startRobotSync(robotId);
      },
      stopRobotSync: (robotId: string) => {
        controller.stopRobotSync(robotId);
      },
      updateRobotPanelState: (robotId: string, panel: Partial<RobotPanelState>) => {
        controller.updateRobotPanelState(robotId, panel);
      },
      updateRobotHomeAngles: (robotId: string, homeAngles: number[]) => {
        controller.updateRobotHomeAngles(robotId, homeAngles);
      },
      updateRobotJointAngles: (robotId: string, angles: number[]) =>
        controller.updateRobotJointAngles(robotId, angles),
    };
  }, [controller, snapshot]);

  return (
    <RobotControlContext.Provider value={value}>
      {children}
    </RobotControlContext.Provider>
  );
}

export function useRobotControl(): RobotControlContextValue {
  const context = useContext(RobotControlContext);
  if (!context) {
    throw new Error("useRobotControl must be used within a RobotControlProvider.");
  }
  return context;
}
