import type { Robot, RobotJointState } from '../../../entities/robot/model/types';
import type { RobotStoreState } from '../../../entities/robot/model/store';
import {
  createJointStateManager,
  type JointStateManager,
} from './jointStateManager';
import {
  createRobotJointSyncSession,
  getActiveRobot,
  type RobotJointSyncResult,
  type RobotJointSyncSession,
} from './robotJointSync';

export interface RobotJointRuntimeStartResult {
  started: boolean;
  reason?: 'noVisualJoints' | 'writerBlocked';
  robotId: string;
  manager: JointStateManager;
  session?: RobotJointSyncSession;
}

export interface RobotJointRuntimeUpdateResult {
  synced: boolean;
  reason?: RobotJointSyncResult['reason'] | 'noSession';
  robotId?: string;
  angles: number[];
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

  startSync(robot: Robot): RobotJointRuntimeStartResult {
    const manager = this.getManager(robot.robotId);
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
      reason: mounted ? undefined : 'writerBlocked',
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
        angles: [],
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
