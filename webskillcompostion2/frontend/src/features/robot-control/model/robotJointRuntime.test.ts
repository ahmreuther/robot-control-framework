import { describe, expect, it } from 'vitest';

import type { Robot } from '../../../entities/robot/model/types';
import { JOINT_SOURCE_ID } from './jointStateManager';
import { createRobotJointRuntime } from './robotJointRuntime';

function robot(robotId: string, offset = 0): Robot {
  return {
    robotId,
    motionDeviceId: robotId,
    serverUrl: 'opc.tcp://127.0.0.1:4840',
    displayName: robotId,
    motionDevice: { nodeId: `ns=4;s=${robotId}` },
    info: {},
    opcua: {
      variables: {},
      methods: {},
      axes: {
        Axis_1: {
          axisName: 'Axis_1',
          axisNodeId: `ns=4;s=${robotId}.Axis_1`,
        },
        Axis_2: {
          axisName: 'Axis_2',
          axisNodeId: `ns=4;s=${robotId}.Axis_2`,
        },
      },
    },
    status: 'connected',
    joints: {
      axisValues: {
        Axis_1: offset + 0.1,
        Axis_2: offset + 0.2,
      },
      unit: 'C81',
    },
    mode: null,
    visual: {
      urdfId: null,
      urdfLabel: null,
      urdfUrl: null,
      origin: {
        x: 0,
        y: 0,
        z: 0,
      },
      orderedUrdfJointNames: ['joint_1', 'joint_2'],
      axisToJointName: {
        Axis_1: 'joint_1',
        Axis_2: 'joint_2',
      },
    },
    panel: {
      useDegrees: false,
      showCollisionMap: false,
      showWorkspace: false,
    },
  };
}

describe('RobotJointRuntime', () => {
  it('creates a stable joint manager per robot', () => {
    const runtime = createRobotJointRuntime();

    const first = runtime.getManager('robot-a');
    const second = runtime.getManager('robot-a');
    const other = runtime.getManager('robot-b');

    expect(first).toBe(second);
    expect(first === other).toBe(false);
  });

  it('starts sync and applies updates for one robot', () => {
    const runtime = createRobotJointRuntime();

    const started = runtime.startSync(robot('robot-a'));
    const update = runtime.update('robot-a', {
      axisValues: {
        Axis_1: 1,
        Axis_2: 2,
      },
      unit: 'C81',
    });

    expect(started.started).toBe(true);
    expect(runtime.isSyncing('robot-a')).toBe(true);
    expect(update.synced).toBe(true);
    expect(runtime.getManager('robot-a').getAngles()).toEqual([1, 2]);
  });

  it('configures a manual source and joint names for a robot manager', () => {
    const runtime = createRobotJointRuntime();

    const manager = runtime.configureRobot(robot('robot-a'));

    expect(manager.getOrderedJointNames()).toEqual(['joint_1', 'joint_2']);
    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.MANUAL);
    expect(manager.getAngles()).toEqual([0.1, 0.2]);
  });

  it('does not apply updates when no sync session exists', () => {
    const runtime = createRobotJointRuntime();

    expect(
      runtime.update('robot-a', {
        axisValues: {
          Axis_1: 1,
        },
      }),
    ).toEqual({
      synced: false,
      reason: 'noSession',
      robotId: 'robot-a',
      axisToJointName: {},
    });
  });

  it('stops sync and unmounts the session source', () => {
    const runtime = createRobotJointRuntime();

    runtime.startSync(robot('robot-a'));
    runtime.stopSync('robot-a');

    expect(runtime.isSyncing('robot-a')).toBe(false);
    expect(runtime.getManager('robot-a').getActiveSource()?.id).toBe(JOINT_SOURCE_ID.MANUAL);
    expect(runtime.update('robot-a', { axisValues: { Axis_1: 1 } }).reason).toBe('noSession');
  });

  it('keeps multiple robot managers and sessions isolated', () => {
    const runtime = createRobotJointRuntime();

    runtime.startSync(robot('robot-a'));
    runtime.startSync(robot('robot-b', 10));
    runtime.update('robot-a', {
      axisValues: {
        Axis_1: 1,
        Axis_2: 2,
      },
    });
    runtime.update('robot-b', {
      axisValues: {
        Axis_1: 11,
        Axis_2: 12,
      },
    });

    expect(runtime.getManager('robot-a').getAngles()).toEqual([1, 2]);
    expect(runtime.getManager('robot-b').getAngles()).toEqual([11, 12]);
  });

  it('removes robot runtime state', () => {
    const runtime = createRobotJointRuntime();

    runtime.startSync(robot('robot-a'));
    runtime.removeRobot('robot-a');

    expect(runtime.getExistingManager('robot-a')).toBe(null);
    expect(runtime.getSession('robot-a')).toBe(null);
  });

  it('starts active robot sync from robot store state', () => {
    const runtime = createRobotJointRuntime();
    const active = robot('robot-a');

    const result = runtime.startActiveRobotSync({
      byId: { [active.robotId]: active },
      activeRobotId: active.robotId,
    });

    expect(result?.started).toBe(true);
    expect(runtime.isSyncing('robot-a')).toBe(true);
    expect(runtime.startActiveRobotSync({ byId: {}, activeRobotId: null })).toBe(null);
  });
});
