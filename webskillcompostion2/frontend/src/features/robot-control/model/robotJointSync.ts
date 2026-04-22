import type { Robot, RobotJointState, RobotVisualBinding } from '../../../entities/robot/model/types';
import type { RobotStoreState } from '../../../entities/robot/model/store';
import { buildAxisToJointMap, mapAxisValuesToJointAngles } from './axisMapping';
import {
  JOINT_WRITER_ID,
  JOINT_WRITER_PRIORITY,
  type JointStateManager,
} from './jointStateManager';

export interface RobotJointSyncResult {
  synced: boolean;
  reason?:
    | 'noActiveRobot'
    | 'robotMissing'
    | 'noVisualJoints'
    | 'notStarted'
    | 'writerBlocked';
  robotId?: string;
  angles: number[];
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
  start(): boolean;
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

  return {
    robotId: robot.robotId,
    mapping,

    isStarted() {
      return started;
    },

    start() {
      jointManager.setJointNames(mapping.orderedJointNames);
      const mounted = jointManager.mountWriter(JOINT_WRITER_ID.SYN, JOINT_WRITER_PRIORITY.SYN);
      started = true;
      return mounted;
    },

    update(jointState: RobotJointState) {
      const mapped = mapAxisValuesToJointAngles(
        jointState,
        mapping.orderedJointNames,
        mapping.axisToJointName,
      );

      if (!started) {
        return {
          synced: false,
          reason: 'notStarted',
          robotId: robot.robotId,
          angles: mapped.angles,
          axisToJointName: mapping.axisToJointName,
        };
      }

      const synced = jointManager.setAngles(JOINT_WRITER_ID.SYN, mapped.angles);
      return {
        synced,
        reason: synced ? undefined : 'writerBlocked',
        robotId: robot.robotId,
        angles: mapped.angles,
        axisToJointName: mapping.axisToJointName,
      };
    },

    stop() {
      jointManager.unmountWriter(JOINT_WRITER_ID.SYN);
      started = false;
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
      angles: [],
      axisToJointName: {},
    };
  }

  const robot = getActiveRobot(state);
  if (!robot) {
    return {
      synced: false,
      reason: 'robotMissing',
      robotId: state.activeRobotId,
      angles: [],
      axisToJointName: {},
    };
  }

  const session = createRobotJointSyncSession(robot, jointManager);
  if (session === null) {
    return {
      synced: false,
      reason: 'noVisualJoints',
      robotId: robot.robotId,
      angles: [],
      axisToJointName: robot.visual.axisToJointName,
    };
  }

  return session;
}
