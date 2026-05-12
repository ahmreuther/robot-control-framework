import type { Robot, RobotJointState } from '../../../entities/robot/model/types';
import type { RobotStoreState } from '../../../entities/robot/model/store';
import {
  createJointStateManager,
  JOINT_SOURCE_ID,
  JOINT_SOURCE_PRIORITY,
  type JointStateManager,
} from './jointStateManager';
import {
  createRobotJointSyncSession,
  getActiveRobot,
  createRobotJointMapping,
  type RobotJointSyncResult,
  type RobotJointSyncSession,
} from './robotJointSync';
import { mapRobotJointStateToVisualAngles } from './axisMapping';

export interface RobotJointRuntimeStartResult {
  started: boolean;
  reason?: 'noVisualJoints';
  robotId: string;
  manager: JointStateManager;
  session?: RobotJointSyncSession;
}

export interface RobotJointRuntimeUpdateResult {
  synced: boolean;
  reason?: RobotJointSyncResult['reason'] | 'noSession';
  robotId?: string;
  axisToJointName: Record<string, string>;
}

export class RobotJointRuntime {
  private readonly managersByRobotId = new Map<string, JointStateManager>();
  private readonly sessionsByRobotId = new Map<string, RobotJointSyncSession>();

  getManager(robotId: string): JointStateManager {
    let manager = this.managersByRobotId.get(robotId);
    if (!manager) {
      manager = createJointStateManager();
      this.managersByRobotId.set(robotId, manager);
    }
    return manager;
  }

  getExistingManager(robotId: string): JointStateManager | null {
    return this.managersByRobotId.get(robotId) ?? null;
  }

  getSession(robotId: string): RobotJointSyncSession | null {
    return this.sessionsByRobotId.get(robotId) ?? null;
  }

  isSyncing(robotId: string): boolean {
    return this.sessionsByRobotId.get(robotId)?.isStarted() ?? false;
  }

  configureRobot(robot: Robot): JointStateManager {
    const manager = this.getManager(robot.robotId);
    const mapping = createRobotJointMapping(robot);
    const jointNames = mapping?.orderedJointNames ?? robot.visual.orderedUrdfJointNames;

    manager.setJointNames(jointNames);
    manager.mountSource(JOINT_SOURCE_ID.MANUAL, JOINT_SOURCE_PRIORITY.MANUAL);

    if (jointNames.length === 0) {
      return manager;
    }

    const currentAngles = manager.getAngles();
    if (currentAngles.length === jointNames.length) {
      return manager;
    }

    const initialAngles =
      Object.keys(robot.joints.axisValues).length > 0
        ? mapRobotJointStateToVisualAngles(robot).angles
        : jointNames.map(() => 0);
    manager.updateFromSource(JOINT_SOURCE_ID.MANUAL, initialAngles);
    return manager;
  }

  updateManualAngles(robotId: string, angles: number[]): boolean {
    return this.getManager(robotId).updateFromSource(JOINT_SOURCE_ID.MANUAL, angles);
  }

  startSync(robot: Robot): RobotJointRuntimeStartResult {
    const manager = this.configureRobot(robot);
    this.stopSync(robot.robotId);

    const session = createRobotJointSyncSession(robot, manager);
    if (session === null) {
      return {
        started: false,
        reason: 'noVisualJoints',
        robotId: robot.robotId,
        manager,
      };
    }

    const mounted = session.start();
    this.sessionsByRobotId.set(robot.robotId, session);
    return {
      started: mounted,
      reason: mounted ? undefined : 'noVisualJoints',
      robotId: robot.robotId,
      manager,
      session,
    };
  }

  startActiveRobotSync(state: RobotStoreState): RobotJointRuntimeStartResult | null {
    const robot = getActiveRobot(state);
    if (!robot) return null;
    return this.startSync(robot);
  }

  update(robotId: string, jointState: RobotJointState): RobotJointRuntimeUpdateResult {
    const session = this.sessionsByRobotId.get(robotId);
    if (!session) {
      return {
        synced: false,
        reason: 'noSession',
        robotId,
        axisToJointName: {},
      };
    }

    return session.update(jointState);
  }

  stopSync(robotId: string): void {
    const session = this.sessionsByRobotId.get(robotId);
    if (!session) return;

    session.stop();
    this.sessionsByRobotId.delete(robotId);
  }

  removeRobot(robotId: string): void {
    this.stopSync(robotId);
    this.managersByRobotId.delete(robotId);
  }

  clear(): void {
    for (const robotId of this.sessionsByRobotId.keys()) {
      this.stopSync(robotId);
    }
    this.managersByRobotId.clear();
  }
}

export function createRobotJointRuntime(): RobotJointRuntime {
  return new RobotJointRuntime();
}
