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
      skills: {},
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
    actions: {},
    status: 'connected',
    joints: {
      axisValues: {
        Axis_1: offset + 0.1,
        Axis_2: offset + 0.2,
      },
      unit: 'C81',
    },
    actionStates: {},
    mode: null,
    homeAngles: null,
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
      workspaceSampleCount: 1000000,
      workspaceGeneratedSampleCount: null,
      workspaceGenerationPending: false,
      workspaceProgressPercent: null,
      workspaceProgressLabel: null,
      workspaceGenerationVersion: 0,
      workspaceAbortVersion: 0,
      goalMarkerEnabled: true,
      goalMarkerConstraintMode: 'pose',
      goalMarkerMode: 'translate',
      goalMarkerSpace: 'world',
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

  it('configures an FK base source and joint names for a robot manager', () => {
    const runtime = createRobotJointRuntime();

    const manager = runtime.configureRobot(robot('robot-a'));

    expect(manager.getOrderedJointNames()).toEqual(['joint_1', 'joint_2']);
    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.FK);
    expect(manager.getAngles()).toEqual([0.1, 0.2]);
  });

  it('runs a one-shot animation source to target angles and releases back to FK', () => {
    const runtime = createRobotJointRuntime();
    const manager = runtime.configureRobot(robot('robot-a'));

    const started = runtime.startAnimationToAngles('robot-a', [1, 2], {
      durationMs: 100,
    });

    expect(started).toBe(true);
    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.ANIMATION);

    runtime.advanceAnimation('robot-a', performance.now() + 50);
    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.ANIMATION);

    runtime.advanceAnimation('robot-a', performance.now() + 200);
    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.FK);
    expect(manager.getAngles()).toEqual([1, 2]);
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
    expect(runtime.getManager('robot-a').getActiveSource()?.id).toBe(JOINT_SOURCE_ID.FK);
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

  it('preserves manipulated angles when resuming sync after a committed drag', () => {
    const runtime = createRobotJointRuntime();
    runtime.startSync(robot('robot-a'));
    runtime.update('robot-a', {
      axisValues: {
        Axis_1: 1,
        Axis_2: 2,
      },
      unit: 'C81',
    });

    const manager = runtime.getManager('robot-a');
    runtime.beginManipulation('robot-a', JOINT_SOURCE_ID.DRAG);
    manager.updateFromSource(JOINT_SOURCE_ID.DRAG, [3, 4]);
    runtime.endManipulation('robot-a', JOINT_SOURCE_ID.DRAG, {
      preserveAnglesOnResume: true,
    });

    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.SYNC);
    expect(manager.getAngles()).toEqual([3, 4]);
  });

  it('continues from the current shared pose when switching between local manipulation sources', () => {
    const runtime = createRobotJointRuntime();
    const manager = runtime.configureRobot(robot('robot-a'));

    runtime.beginManipulation('robot-a', JOINT_SOURCE_ID.MANUAL);
    manager.updateFromSource(JOINT_SOURCE_ID.MANUAL, [1, 2]);
    runtime.endManipulation('robot-a', JOINT_SOURCE_ID.MANUAL);

    runtime.beginManipulation('robot-a', JOINT_SOURCE_ID.IK);
    manager.updateFromSource(JOINT_SOURCE_ID.IK, [3, 4]);
    runtime.endManipulation('robot-a', JOINT_SOURCE_ID.IK);

    runtime.beginManipulation('robot-a', JOINT_SOURCE_ID.MANUAL);

    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.MANUAL);
    expect(manager.getAngles()).toEqual([3, 4]);
  });

  it('restores the manipulation checkpoint when a local manipulation is canceled', () => {
    const runtime = createRobotJointRuntime();
    const manager = runtime.configureRobot(robot('robot-a'));

    runtime.beginManipulation('robot-a', JOINT_SOURCE_ID.MANUAL);
    manager.updateFromSource(JOINT_SOURCE_ID.MANUAL, [1, 2]);
    runtime.endManipulation('robot-a', JOINT_SOURCE_ID.MANUAL);

    runtime.beginManipulation('robot-a', JOINT_SOURCE_ID.IK);
    manager.updateFromSource(JOINT_SOURCE_ID.IK, [3, 4]);
    runtime.endManipulation('robot-a', JOINT_SOURCE_ID.IK, {
      cancel: true,
    });

    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.FK);
    expect(manager.getAngles()).toEqual([1, 2]);
  });

  it('keeps the higher priority manipulation active when a lower priority source tries to take over', () => {
    const runtime = createRobotJointRuntime();
    const manager = runtime.configureRobot(robot('robot-a'));

    runtime.beginManipulation('robot-a', JOINT_SOURCE_ID.IK);
    manager.updateFromSource(JOINT_SOURCE_ID.IK, [3, 4]);

    const result = runtime.beginManipulation('robot-a', JOINT_SOURCE_ID.DRAG);

    expect(result?.sourceId).toBe(JOINT_SOURCE_ID.IK);
    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.IK);
    expect(manager.getAngles()).toEqual([3, 4]);
  });

  it('reverts to the latest sync state when a sync manipulation is canceled', () => {
    const runtime = createRobotJointRuntime();
    runtime.startSync(robot('robot-a'));
    runtime.update('robot-a', {
      axisValues: {
        Axis_1: 1,
        Axis_2: 2,
      },
      unit: 'C81',
    });

    const manager = runtime.getManager('robot-a');
    runtime.beginManipulation('robot-a', JOINT_SOURCE_ID.DRAG);
    manager.updateFromSource(JOINT_SOURCE_ID.DRAG, [3, 4]);
    runtime.endManipulation('robot-a', JOINT_SOURCE_ID.DRAG, {
      cancel: true,
    });

    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.SYNC);
    expect(manager.getAngles()).toEqual([1, 2]);
  });

  it('tracks one in-flight sync goto per robot', () => {
    const runtime = createRobotJointRuntime();

    expect(runtime.hasInFlightSyncGoto('robot-a')).toBe(false);
    runtime.markSyncGotoInFlight('robot-a', 'request-1');
    expect(runtime.hasInFlightSyncGoto('robot-a')).toBe(true);
    expect(runtime.clearSyncGotoInFlightByRequestId('request-1')).toBe('robot-a');
    expect(runtime.hasInFlightSyncGoto('robot-a')).toBe(false);
  });

  it('clears in-flight sync goto state when sync stops', () => {
    const runtime = createRobotJointRuntime();

    runtime.startSync(robot('robot-a'));
    runtime.markSyncGotoInFlight('robot-a', 'request-1');
    runtime.stopSync('robot-a');

    expect(runtime.hasInFlightSyncGoto('robot-a')).toBe(false);
    expect(runtime.isSyncing('robot-a')).toBe(false);
  });

});
