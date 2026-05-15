import type { Robot, RobotJointState, RobotVisualBinding } from '../../../entities/robot/model/types';
import type { RobotStoreState } from '../../../entities/robot/model/store';
import { buildAxisToJointMap, mapAxisValuesToJointAngles } from './axisMapping';
import {
  JOINT_SOURCE_ID,
  JOINT_SOURCE_PRIORITY,
  type JointStateManager,
} from './jointStateManager';

export interface RobotJointSyncResult {
  synced: boolean;
  reason?:
    | 'noActiveRobot'
    | 'robotMissing'
    | 'noVisualJoints'
    | 'notStarted'
    | 'suspended';
  robotId?: string;
  axisToJointName: Record<string, string>;
}

export interface RobotJointMapping {
  robotId: string;
  orderedJointNames: string[];
  axisToJointName: Record<string, string>;
}

export interface RobotJointSyncSession {
  readonly robotId: string;
  readonly mapping: RobotJointMapping;
  isStarted(): boolean;
  isSuspended(): boolean;
  start(): boolean;
  suspend(): void;
  resume(): boolean;
  update(jointState: RobotJointState): RobotJointSyncResult;
  stop(): void;
}

export function getActiveRobot(state: RobotStoreState): Robot | null {
  if (!state.activeRobotId) return null;
  return state.byId[state.activeRobotId] ?? null;
}

export function updateRobotVisualBinding(
  robot: Robot,
  visual: Partial<RobotVisualBinding>,
): Robot {
  return {
    ...robot,
    visual: {
      ...robot.visual,
      ...visual,
    },
  };
}

export function createRobotJointMapping(robot: Robot): RobotJointMapping | null {
  if (!robot.visual.orderedUrdfJointNames.length) {
    return null;
  }

  const axisToJointName =
    Object.keys(robot.visual.axisToJointName).length > 0
      ? robot.visual.axisToJointName
      : buildAxisToJointMap(
          Object.keys(robot.opcua.axes).length
            ? Object.keys(robot.opcua.axes)
            : Object.keys(robot.joints.axisValues),
          robot.visual.orderedUrdfJointNames,
        );

  return {
    robotId: robot.robotId,
    orderedJointNames: [...robot.visual.orderedUrdfJointNames],
    axisToJointName,
  };
}

export function applyRobotJointMapping(robot: Robot): Robot {
  const mapping = createRobotJointMapping(robot);
  if (mapping === null) {
    return robot;
  }

  return updateRobotVisualBinding(robot, {
    axisToJointName: mapping.axisToJointName,
  });
}

export function createRobotJointSyncSession(
  robot: Robot,
  jointManager: JointStateManager,
): RobotJointSyncSession | null {
  const mapping = createRobotJointMapping(robot);
  if (mapping === null) {
    return null;
  }

  let started = false;
  let suspended = false;
  let latestAngles = jointManager.getAngles();

  return {
    robotId: robot.robotId,
    mapping,

    isStarted() {
      return started;
    },

    isSuspended() {
      return suspended;
    },

    start() {
      jointManager.setJointNames(mapping.orderedJointNames);
      jointManager.mountSource(JOINT_SOURCE_ID.SYNC, JOINT_SOURCE_PRIORITY.SYNC);
      const mounted = jointManager.setActiveSource(JOINT_SOURCE_ID.SYNC);
      started = true;
      suspended = false;
      if (mounted && latestAngles.length === mapping.orderedJointNames.length) {
        jointManager.updateFromSource(JOINT_SOURCE_ID.SYNC, latestAngles);
      }
      return mounted;
    },

    suspend() {
      if (!started || suspended) {
        return;
      }
      jointManager.unmountSource(JOINT_SOURCE_ID.SYNC);
      suspended = true;
    },

    resume() {
      if (!started) {
        return false;
      }
      jointManager.mountSource(JOINT_SOURCE_ID.SYNC, JOINT_SOURCE_PRIORITY.SYNC);
      const resumed = jointManager.setActiveSource(JOINT_SOURCE_ID.SYNC);
      suspended = false;
      if (resumed && latestAngles.length === mapping.orderedJointNames.length) {
        jointManager.updateFromSource(JOINT_SOURCE_ID.SYNC, latestAngles);
      }
      return resumed;
    },

    update(jointState: RobotJointState) {
      const mapped = mapAxisValuesToJointAngles(
        jointState,
        mapping.orderedJointNames,
        mapping.axisToJointName,
      );
      latestAngles = mapped.angles;

      if (!started) {
        return {
          synced: false,
          reason: 'notStarted',
          robotId: robot.robotId,
          axisToJointName: mapping.axisToJointName,
        };
      }

      if (suspended) {
        return {
          synced: false,
          reason: 'suspended',
          robotId: robot.robotId,
          axisToJointName: mapping.axisToJointName,
        };
      }

      const synced = jointManager.updateFromSource(
        JOINT_SOURCE_ID.SYNC,
        mapped.angles,
      );
      return {
        synced,
        reason: synced ? undefined : 'notStarted',
        robotId: robot.robotId,
        axisToJointName: mapping.axisToJointName,
      };
    },

    stop() {
      jointManager.unmountSource(JOINT_SOURCE_ID.SYNC);
      started = false;
      suspended = false;
    },
  };
}

export function createActiveRobotJointSyncSession(
  state: RobotStoreState,
  jointManager: JointStateManager,
): RobotJointSyncSession | RobotJointSyncResult {
  if (!state.activeRobotId) {
    return {
      synced: false,
      reason: 'noActiveRobot',
      axisToJointName: {},
    };
  }

  const robot = getActiveRobot(state);
  if (!robot) {
    return {
      synced: false,
      reason: 'robotMissing',
      robotId: state.activeRobotId,
      axisToJointName: {},
    };
  }

  const session = createRobotJointSyncSession(robot, jointManager);
  if (session === null) {
    return {
      synced: false,
      reason: 'noVisualJoints',
      robotId: robot.robotId,
      axisToJointName: robot.visual.axisToJointName,
    };
  }

  return session;
}
