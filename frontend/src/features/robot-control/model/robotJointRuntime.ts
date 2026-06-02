import type { Robot, RobotJointState } from '../../../entities/robot/model/types';
import type { RobotStoreState } from '../../../entities/robot/model/store';
import {
  createJointStateManager,
  JOINT_SOURCE_ID,
  JOINT_SOURCE_PRIORITY,
  type JointSourceId,
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

interface RobotJointManipulationState {
  robotId: string;
  sourceId: JointSourceId;
  syncWasActive: boolean;
  checkpointAngles: number[];
}

interface InFlightSyncGotoRequest {
  requestId: string;
}

const DEFAULT_SYNC_GOTO_CHANGE_THRESHOLD = 1e-2;

interface JointAnimationState {
  robotId: string;
  fromAngles: number[];
  targetAngles: number[];
  startedAtMs: number;
  durationMs: number;
  syncWasActive: boolean;
}

export class RobotJointRuntime {
  private readonly managersByRobotId = new Map<string, JointStateManager>();
  private readonly sessionsByRobotId = new Map<string, RobotJointSyncSession>();
  private readonly manipulationsByRobotId = new Map<string, RobotJointManipulationState>();
  private readonly syncGotoRequestByRobotId = new Map<string, InFlightSyncGotoRequest>();
  private readonly animationsByRobotId = new Map<string, JointAnimationState>();

  private sourcePriority(sourceId: JointSourceId): number {
    switch (sourceId) {
      case JOINT_SOURCE_ID.DRAG:
        return JOINT_SOURCE_PRIORITY.DRAG;
      case JOINT_SOURCE_ID.IK:
        return JOINT_SOURCE_PRIORITY.IK;
      case JOINT_SOURCE_ID.FK:
        return JOINT_SOURCE_PRIORITY.FK;
      case JOINT_SOURCE_ID.MANUAL:
      default:
        return JOINT_SOURCE_PRIORITY.MANUAL;
    }
  }

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

  hasInFlightSyncGoto(robotId: string): boolean {
    return this.syncGotoRequestByRobotId.has(robotId);
  }

  markSyncGotoInFlight(robotId: string, requestId: string): void {
    this.syncGotoRequestByRobotId.set(robotId, {
      requestId,
    });
  }

  clearSyncGotoInFlightByRequestId(requestId: string): string | null {
    for (const [robotId, activeRequest] of this.syncGotoRequestByRobotId.entries()) {
      if (activeRequest.requestId !== requestId) {
        continue;
      }
      this.syncGotoRequestByRobotId.delete(robotId);
      return robotId;
    }

    return null;
  }

  clearSyncGotoInFlight(robotId: string): void {
    this.syncGotoRequestByRobotId.delete(robotId);
  }

  hasMeaningfulManipulationChange(
    robotId: string,
    threshold = DEFAULT_SYNC_GOTO_CHANGE_THRESHOLD,
  ): boolean {
    const state = this.manipulationsByRobotId.get(robotId);
    if (!state) {
      return false;
    }
    const currentAngles = this.getManager(robotId).getAngles();
    const checkpointAngles = state.checkpointAngles;
    if (currentAngles.length !== checkpointAngles.length) {
      return true;
    }
    return currentAngles.some(
      (angle, index) => Math.abs(angle - checkpointAngles[index]) > threshold,
    );
  }

  startAnimationToAngles(
    robotId: string,
    targetAngles: number[],
    options?: { durationMs?: number; fromAngles?: number[] },
  ): boolean {
    const manager = this.getManager(robotId);
    const currentAngles = manager.getAngles();
    const fromAngles = options?.fromAngles ?? currentAngles;
    manager.mountSource(
      JOINT_SOURCE_ID.ANIMATION,
      JOINT_SOURCE_PRIORITY.ANIMATION,
    );
    manager.setActiveSource(JOINT_SOURCE_ID.ANIMATION);

    if (targetAngles.length === 0 || fromAngles.length !== targetAngles.length) {
      manager.unmountSource(JOINT_SOURCE_ID.ANIMATION);
      return false;
    }

    const alreadyAtTarget = fromAngles.every(
      (angle, index) => Math.abs(angle - targetAngles[index]) <= 1e-6,
    );
    if (alreadyAtTarget) {
      manager.unmountSource(JOINT_SOURCE_ID.ANIMATION);
      return false;
    }

    const session = this.sessionsByRobotId.get(robotId);
    const syncWasActive = session?.isStarted() ?? false;
    if (syncWasActive) {
      session?.suspend();
    }
    manager.updateFromSource(JOINT_SOURCE_ID.ANIMATION, fromAngles);

    this.animationsByRobotId.set(robotId, {
      robotId,
      fromAngles: [...fromAngles],
      targetAngles: [...targetAngles],
      startedAtMs: performance.now(),
      durationMs: options?.durationMs ?? 400,
      syncWasActive,
    });
    return true;
  }

  advanceAnimation(robotId: string, nowMs = performance.now()): boolean {
    const animation = this.animationsByRobotId.get(robotId);
    if (!animation) {
      return false;
    }

    const manager = this.getManager(robotId);
    const durationMs = Math.max(animation.durationMs, 1);
    const rawProgress = Math.min(
      Math.max((nowMs - animation.startedAtMs) / durationMs, 0),
      1,
    );
    const easedProgress = 1 - Math.pow(1 - rawProgress, 3);
    const nextAngles = animation.fromAngles.map((fromAngle, index) => {
      const targetAngle = animation.targetAngles[index] ?? fromAngle;
      return fromAngle + (targetAngle - fromAngle) * easedProgress;
    });

    manager.updateFromSource(JOINT_SOURCE_ID.ANIMATION, nextAngles);

    if (rawProgress < 1) {
      return true;
    }

    manager.unmountSource(JOINT_SOURCE_ID.ANIMATION);
    this.animationsByRobotId.delete(robotId);
    if (animation.syncWasActive) {
      this.sessionsByRobotId.get(robotId)?.resume();
    }
    return false;
  }

  configureRobot(robot: Robot): JointStateManager {
    const manager = this.getManager(robot.robotId);
    const mapping = createRobotJointMapping(robot);
    // The manager owns the full movable URDF joint state. Solver / axis mapping can use narrower lists.
    const managerJointNames = robot.visual.allUrdfJointNames ?? [];
    const jointNames =
      managerJointNames.length > 0
        ? managerJointNames
        : mapping?.orderedJointNames ?? robot.visual.orderedUrdfJointNames;

    manager.setJointNames(jointNames);
    manager.mountSource(JOINT_SOURCE_ID.FK, JOINT_SOURCE_PRIORITY.FK);

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
    manager.updateFromSource(JOINT_SOURCE_ID.FK, initialAngles);
    return manager;
  }

  updateManualAngles(robotId: string, angles: number[]): boolean {
    const manager = this.getManager(robotId);
    const sourceId = manager.hasSource(JOINT_SOURCE_ID.MANUAL)
      ? JOINT_SOURCE_ID.MANUAL
      : JOINT_SOURCE_ID.FK;
    return manager.updateFromSource(sourceId, angles);
  }

  beginManipulation(robotId: string, sourceId: JointSourceId): RobotJointManipulationState | null {
    const manager = this.getManager(robotId);
    const existing = this.manipulationsByRobotId.get(robotId);
    if (existing) {
      if (!manager.canSourceTakeControl(sourceId, this.sourcePriority(sourceId))) {
        return existing;
      }
      const checkpointAngles = manager.getAngles();
      if (existing.sourceId !== sourceId) {
        manager.unmountSource(existing.sourceId);
      }
      manager.mountSource(sourceId, this.sourcePriority(sourceId));
      manager.setActiveSource(sourceId);
      const nextState: RobotJointManipulationState = {
        robotId,
        sourceId,
        syncWasActive: existing.syncWasActive,
        checkpointAngles,
      };
      this.manipulationsByRobotId.set(robotId, nextState);
      return nextState;
    }

    const session = this.sessionsByRobotId.get(robotId);
    const syncWasActive = session?.isStarted() ?? false;
    if (syncWasActive) {
      session?.suspend();
    }
    if (!manager.canSourceTakeControl(sourceId, this.sourcePriority(sourceId))) {
      if (syncWasActive) {
        session?.resume();
      }
      return null;
    }
    const checkpointAngles = manager.getAngles();

    manager.mountSource(sourceId, this.sourcePriority(sourceId));
    manager.setActiveSource(sourceId);

    const state: RobotJointManipulationState = {
      robotId,
      sourceId,
      syncWasActive,
      checkpointAngles,
    };
    this.manipulationsByRobotId.set(robotId, state);
    return state;
  }

  endManipulation(
    robotId: string,
    sourceId: JointSourceId,
    options?: {
      cancel?: boolean;
      preserveAnglesOnResume?: boolean;
    },
  ): void {
    const manager = this.getManager(robotId);
    const state = this.manipulationsByRobotId.get(robotId);
    const committedAngles = manager.getAngles();

    if (options?.cancel && state && !state.syncWasActive) {
      manager.updateFromSource(sourceId, state.checkpointAngles);
    }

    manager.unmountSource(sourceId);

    if (state?.syncWasActive) {
      const session = this.sessionsByRobotId.get(robotId);
      if (session && options?.preserveAnglesOnResume) {
        session.setLatestAngles(committedAngles);
      }
      session?.resume();
    }

    this.manipulationsByRobotId.delete(robotId);
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

    const result = session.update(jointState);
    return result;
  }

  stopSync(robotId: string): void {
    const session = this.sessionsByRobotId.get(robotId);
    if (!session) return;

    session.stop();
    this.sessionsByRobotId.delete(robotId);
    this.manipulationsByRobotId.delete(robotId);
    this.syncGotoRequestByRobotId.delete(robotId);
  }

  removeRobot(robotId: string): void {
    this.stopSync(robotId);
    this.animationsByRobotId.delete(robotId);
    this.managersByRobotId.delete(robotId);
    this.manipulationsByRobotId.delete(robotId);
    this.syncGotoRequestByRobotId.delete(robotId);
  }

  clear(): void {
    for (const robotId of this.sessionsByRobotId.keys()) {
      this.stopSync(robotId);
    }
    this.managersByRobotId.clear();
    this.animationsByRobotId.clear();
    this.syncGotoRequestByRobotId.clear();
  }
}

export function createRobotJointRuntime(): RobotJointRuntime {
  return new RobotJointRuntime();
}
