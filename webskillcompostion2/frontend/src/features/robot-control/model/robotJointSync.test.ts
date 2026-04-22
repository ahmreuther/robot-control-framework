import { describe, expect, it } from 'vitest';

import type { Robot } from '../../../entities/robot/model/types';
import type { RobotStoreState } from '../../../entities/robot/model/store';
import {
  createJointStateManager,
  JOINT_WRITER_ID,
  JOINT_WRITER_PRIORITY,
} from './jointStateManager';
import {
  applyRobotJointMapping,
  createActiveRobotJointSyncSession,
  createRobotJointMapping,
  createRobotJointSyncSession,
  getActiveRobot,
  updateRobotVisualBinding,
} from './robotJointSync';

function robot(overrides: Partial<Robot> = {}): Robot {
  return {
    robotId: 'robot-a',
    serverUrl: 'opc.tcp://127.0.0.1:4840',
    displayName: 'MotionDevice_EVA',
    motionDevice: { nodeId: 'ns=4;s=robot-a' },
    info: {},
    opcua: {
      variables: {},
      methods: {},
      axes: {
        Axis_1: {
          axisName: 'Axis_1',
          axisNodeId: 'ns=4;i=179',
          actualPositionNodeId: 'ns=4;i=210',
        },
        Axis_2: {
          axisName: 'Axis_2',
          axisNodeId: 'ns=4;i=184',
          actualPositionNodeId: 'ns=4;i=217',
        },
      },
    },
    status: 'connected',
    joints: {
      axisValues: {
        Axis_1: 0.1,
        Axis_2: 0.2,
      },
      unit: 'C81',
    },
    visual: {
      orderedUrdfJointNames: ['joint_1', 'joint_2'],
      axisToJointName: {},
    },
    ...overrides,
    mode: overrides.mode ?? null,
  };
}

describe('robot joint sync lifecycle', () => {
  it('gets the active robot from robot store state', () => {
    const active = robot();
    const state: RobotStoreState = {
      byId: { [active.robotId]: active },
      activeRobotId: active.robotId,
    };

    expect(getActiveRobot(state)).toBe(active);
  });

  it('creates and stores the axis mapping once after discovery and URDF load', () => {
    const original = robot();

    const mapping = createRobotJointMapping(original);
    const updated = applyRobotJointMapping(original);

    expect(mapping?.axisToJointName).toEqual({
      Axis_1: 'joint_1',
      Axis_2: 'joint_2',
    });
    expect(original.visual.axisToJointName).toEqual({});
    expect(updated.visual.axisToJointName).toEqual({
      Axis_1: 'joint_1',
      Axis_2: 'joint_2',
    });
  });

  it('returns null when mapping cannot be created without visual joint order', () => {
    const withoutVisualJoints = robot({
      visual: {
        orderedUrdfJointNames: [],
        axisToJointName: {},
      },
    });

    expect(createRobotJointMapping(withoutVisualJoints)).toBe(null);
    expect(createRobotJointSyncSession(withoutVisualJoints, createJointStateManager())).toBe(null);
  });

  it('starts sync by mounting once, then update only sets angles', () => {
    const manager = createJointStateManager();
    const session = createRobotJointSyncSession(applyRobotJointMapping(robot()), manager);

    if (!session || 'synced' in session) throw new Error('Expected sync session');

    expect(session.isStarted()).toBe(false);
    expect(session.update({ axisValues: { Axis_1: 0.5, Axis_2: 1 }, unit: 'C81' })).toEqual({
      synced: false,
      reason: 'notStarted',
      robotId: 'robot-a',
      angles: [0.5, 1],
      axisToJointName: {
        Axis_1: 'joint_1',
        Axis_2: 'joint_2',
      },
    });
    expect(manager.getAngles()).toEqual([]);

    expect(session.start()).toBe(true);
    expect(session.isStarted()).toBe(true);
    expect(manager.getActiveWriter()?.id).toBe(JOINT_WRITER_ID.SYN);
    expect(manager.getOrderedJointNames()).toEqual(['joint_1', 'joint_2']);

    const firstUpdate = session.update({
      axisValues: { Axis_1: 0.5, Axis_2: 1 },
      unit: 'C81',
    });
    const secondUpdate = session.update({
      axisValues: { Axis_1: 0.6, Axis_2: 1.2 },
      unit: 'C81',
    });

    expect(firstUpdate.synced).toBe(true);
    expect(secondUpdate.synced).toBe(true);
    expect(manager.getAngles()).toEqual([0.6, 1.2]);
  });

  it('stops sync by unmounting the sync writer', () => {
    const manager = createJointStateManager();
    const session = createRobotJointSyncSession(applyRobotJointMapping(robot()), manager);

    if (!session || 'synced' in session) throw new Error('Expected sync session');

    session.start();
    session.stop();

    expect(session.isStarted()).toBe(false);
    expect(manager.getActiveWriter()).toBe(null);
    expect(session.update({ axisValues: { Axis_1: 1, Axis_2: 2 }, unit: 'C81' }).reason).toBe(
      'notStarted',
    );
  });

  it('reports writerBlocked if a higher priority writer is active during updates', () => {
    const manager = createJointStateManager();
    manager.mountWriter(JOINT_WRITER_ID.RESET, JOINT_WRITER_PRIORITY.RESET);
    const session = createRobotJointSyncSession(applyRobotJointMapping(robot()), manager);

    if (!session || 'synced' in session) throw new Error('Expected sync session');

    expect(session.start()).toBe(false);
    const result = session.update({ axisValues: { Axis_1: 0.5, Axis_2: 1 }, unit: 'C81' });

    expect(result.synced).toBe(false);
    expect(result.reason).toBe('writerBlocked');
    expect(manager.getActiveWriter()?.id).toBe(JOINT_WRITER_ID.RESET);
    expect(manager.getAngles()).toEqual([]);
  });

  it('creates active robot sessions or reports why it cannot', () => {
    const manager = createJointStateManager();
    const active = robot();

    const session = createActiveRobotJointSyncSession(
      {
        byId: { [active.robotId]: active },
        activeRobotId: active.robotId,
      },
      manager,
    );

    expect('robotId' in session ? session.robotId : null).toBe(active.robotId);
    expect(
      createActiveRobotJointSyncSession(
        {
          byId: {},
          activeRobotId: null,
        },
        manager,
      ),
    ).toEqual({
      synced: false,
      reason: 'noActiveRobot',
      angles: [],
      axisToJointName: {},
    });
    expect(
      createActiveRobotJointSyncSession(
        {
          byId: {},
          activeRobotId: 'missing',
        },
        manager,
      ),
    ).toEqual({
      synced: false,
      reason: 'robotMissing',
      robotId: 'missing',
      angles: [],
      axisToJointName: {},
    });
  });

  it('updates visual binding immutably', () => {
    const original = robot();
    const updated = updateRobotVisualBinding(original, {
      axisToJointName: { Axis_1: 'joint_2' },
    });

    expect(original.visual.axisToJointName).toEqual({});
    expect(updated.visual.axisToJointName).toEqual({ Axis_1: 'joint_2' });
    expect(updated.visual.orderedUrdfJointNames).toEqual(['joint_1', 'joint_2']);
  });
});
