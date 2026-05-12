import { describe, expect, it } from 'vitest';

import { createLocalRobot, type RobotSessionInfo } from './types';
import { applyRobotMessage, initialRobotStoreState } from './store';

function robotSession(robotId: string, displayName: string): RobotSessionInfo {
  return {
    robotId,
    serverUrl: 'opc.tcp://127.0.0.1:4840',
    displayName,
    motionDevice: {
      nodeId: `ns=4;s=${robotId}`,
      displayName,
      browseName: displayName,
    },
    info: {},
    opcua: {
      variables: {},
      methods: {},
      axes: {},
    },
    status: 'unknown',
  };
}

describe('robot store routing', () => {
  it('does not create local robots from discovered motion devices', () => {
    const state = applyRobotMessage(initialRobotStoreState, {
      type: 'robotsDiscovered',
      serverUrl: 'opc.tcp://127.0.0.1:4840',
      robots: [robotSession('robot-a', 'Robot A'), robotSession('robot-b', 'Robot B')],
    });

    expect(state.byId).toEqual({});
    expect(state.activeRobotId).toBe(null);
  });

  it('applies joint updates only to the addressed robot', () => {
    const discovered = {
      byId: {
        localA: { ...createLocalRobot('localA', 'Local A'), motionDeviceId: 'robot-a' },
        localB: { ...createLocalRobot('localB', 'Local B'), motionDeviceId: 'robot-b' },
      },
      activeRobotId: 'localA',
    };

    const updated = applyRobotMessage(discovered, {
      type: 'robotJointState',
      serverUrl: 'opc.tcp://127.0.0.1:4840',
      robotId: 'robot-b',
      data: {
        axisValues: {
          Axis1: 1.5,
        },
        unit: 'rad',
      },
    });

    expect(updated.byId.localA?.joints.axisValues).toEqual({});
    expect(updated.byId.localB?.joints.axisValues).toEqual({ Axis1: 1.5 });
  });

  it('stores mode updates for the addressed robot', () => {
    const discovered = {
      byId: {
        localA: { ...createLocalRobot('localA', 'Local A'), motionDeviceId: 'robot-a' },
        localB: { ...createLocalRobot('localB', 'Local B'), motionDeviceId: 'robot-b' },
      },
      activeRobotId: 'localA',
    };

    const updated = applyRobotMessage(discovered, {
      type: 'robotModeChanged',
      serverUrl: 'opc.tcp://127.0.0.1:4840',
      robotId: 'robot-b',
      mode: 'automatic',
    });

    expect(updated.byId.localA?.mode).toBe(null);
    expect(updated.byId.localB?.mode).toBe('automatic');
  });

  it('keeps offline robots selected and unbinds bound ones when their server disconnects', () => {
    const discovered = {
      byId: {
        localA: {
          ...createLocalRobot('localA', 'Local A'),
          serverUrl: 'opc.tcp://127.0.0.1:4840',
          motionDeviceId: 'robot-a',
        },
      },
      activeRobotId: 'localA',
    };

    const disconnected = applyRobotMessage(discovered, {
      type: 'serverDisconnected',
      serverUrl: 'opc.tcp://127.0.0.1:4840',
    });

    expect(disconnected.byId.localA?.status).toBe('disconnected');
    expect(disconnected.byId.localA?.motionDeviceId).toBe(null);
    expect(disconnected.byId.localA?.serverUrl).toBe('local://manual');
    expect(disconnected.activeRobotId).toBe('localA');
  });

  it('marks addressed robots as error on error events', () => {
    const discovered = {
      byId: {
        localA: { ...createLocalRobot('localA', 'Local A'), motionDeviceId: 'robot-a' },
      },
      activeRobotId: 'localA',
    };

    const errored = applyRobotMessage(discovered, {
      type: 'error',
      robotId: 'robot-a',
      message: 'Joint read failed',
      code: 'jointReadFailed',
    });

    expect(errored.byId.localA?.status).toBe('error');
  });
});
