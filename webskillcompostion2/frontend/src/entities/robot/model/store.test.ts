import { describe, expect, it } from 'vitest';

import type { RobotSessionInfo } from './types';
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
  it('stores discovered robots by robotId', () => {
    const state = applyRobotMessage(initialRobotStoreState, {
      type: 'robotsDiscovered',
      serverUrl: 'opc.tcp://127.0.0.1:4840',
      robots: [robotSession('robot-a', 'Robot A'), robotSession('robot-b', 'Robot B')],
    });

    expect(Object.keys(state.byId)).toEqual(['robot-a', 'robot-b']);
    expect(state.activeRobotId).toBe('robot-a');
  });

  it('applies joint updates only to the addressed robot', () => {
    const discovered = applyRobotMessage(initialRobotStoreState, {
      type: 'robotsDiscovered',
      serverUrl: 'opc.tcp://127.0.0.1:4840',
      robots: [robotSession('robot-a', 'Robot A'), robotSession('robot-b', 'Robot B')],
    });

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

    expect(updated.byId['robot-a']?.joints.axisValues).toEqual({});
    expect(updated.byId['robot-b']?.joints.axisValues).toEqual({ Axis1: 1.5 });
  });

  it('stores mode updates for the addressed robot', () => {
    const discovered = applyRobotMessage(initialRobotStoreState, {
      type: 'robotsDiscovered',
      serverUrl: 'opc.tcp://127.0.0.1:4840',
      robots: [robotSession('robot-a', 'Robot A'), robotSession('robot-b', 'Robot B')],
    });

    const updated = applyRobotMessage(discovered, {
      type: 'robotModeChanged',
      serverUrl: 'opc.tcp://127.0.0.1:4840',
      robotId: 'robot-b',
      mode: 'automatic',
    });

    expect(updated.byId['robot-a']?.mode).toBe(null);
    expect(updated.byId['robot-b']?.mode).toBe('automatic');
  });

  it('marks robots from a disconnected server as disconnected', () => {
    const discovered = applyRobotMessage(initialRobotStoreState, {
      type: 'robotsDiscovered',
      serverUrl: 'opc.tcp://127.0.0.1:4840',
      robots: [robotSession('robot-a', 'Robot A')],
    });

    const disconnected = applyRobotMessage(discovered, {
      type: 'serverDisconnected',
      serverUrl: 'opc.tcp://127.0.0.1:4840',
    });

    expect(disconnected.byId['robot-a']?.status).toBe('disconnected');
    expect(disconnected.activeRobotId).toBe(null);
  });

  it('marks addressed robots as error on error events', () => {
    const discovered = applyRobotMessage(initialRobotStoreState, {
      type: 'robotsDiscovered',
      serverUrl: 'opc.tcp://127.0.0.1:4840',
      robots: [robotSession('robot-a', 'Robot A')],
    });

    const errored = applyRobotMessage(discovered, {
      type: 'error',
      robotId: 'robot-a',
      message: 'Joint read failed',
      code: 'jointReadFailed',
    });

    expect(errored.byId['robot-a']?.status).toBe('error');
  });
});
