import { describe, expect, it } from 'vitest';

import type { RobotSessionInfo } from '../../robot/model/types';
import {
  applyServerMessage,
  initialServerStoreState,
  selectActiveServer,
  trackMethodCallRequest,
} from './store';

const SERVER_URL = 'opc.tcp://127.0.0.1:4840';

function robotSession(robotId: string): RobotSessionInfo {
  return {
    robotId,
    serverUrl: SERVER_URL,
    displayName: robotId,
    motionDevice: {
      nodeId: `ns=4;s=${robotId}`,
    },
    info: {},
    opcua: {
      variables: {},
      methods: {},
      axes: {},
    },
    status: 'connected',
  };
}

describe('server store routing', () => {
  it('stores connected servers by serverUrl', () => {
    const state = applyServerMessage(initialServerStoreState, {
      type: 'serverConnected',
        server: {
          serverUrl: SERVER_URL,
          status: 'connected',
          namespaceUris: ['http://opcfoundation.org/UA/'],
          isRoboticsServer: true,
          motionDeviceIds: [],
        },
      });

    expect(state.byUrl[SERVER_URL]?.status).toBe('connected');
    expect(state.activeServerUrl).toBe(SERVER_URL);
  });

  it('updates robot ids from discovery even when serverConnected was not received first', () => {
    const state = applyServerMessage(initialServerStoreState, {
      type: 'robotsDiscovered',
      serverUrl: SERVER_URL,
      robots: [robotSession('robot-a'), robotSession('robot-b')],
    });

    expect(state.byUrl[SERVER_URL]?.motionDeviceIds).toEqual(['robot-a', 'robot-b']);
    expect(Object.keys(state.motionDevicesById)).toEqual(['robot-a', 'robot-b']);
    expect(state.byUrl[SERVER_URL]?.status).toBe('connected');
  });

  it('removes disconnected servers and clears active server', () => {
    const connected = applyServerMessage(initialServerStoreState, {
      type: 'serverConnected',
      server: {
        serverUrl: SERVER_URL,
        status: 'connected',
        namespaceUris: [],
        isRoboticsServer: false,
        motionDeviceIds: ['robot-a'],
      },
    });

    const disconnected = applyServerMessage(connected, {
      type: 'serverDisconnected',
      serverUrl: SERVER_URL,
    });

    expect(disconnected.byUrl[SERVER_URL]).toBe(undefined);
    expect(disconnected.motionDevicesById).toEqual({});
    expect(disconnected.activeServerUrl).toBe(null);
  });

  it('falls back to another server when the active server disconnects', () => {
    const otherUrl = 'opc.tcp://127.0.0.1:4841';
    const withFirst = applyServerMessage(initialServerStoreState, {
      type: 'serverConnected',
      server: {
        serverUrl: SERVER_URL,
        status: 'connected',
        namespaceUris: [],
        isRoboticsServer: false,
        motionDeviceIds: [],
      },
    });
    const withSecond = applyServerMessage(withFirst, {
      type: 'serverConnected',
      server: {
        serverUrl: otherUrl,
        status: 'connected',
        namespaceUris: [],
        isRoboticsServer: false,
        motionDeviceIds: [],
      },
    });
    const selectedFirst = selectActiveServer(withSecond, SERVER_URL);
    const disconnected = applyServerMessage(selectedFirst, {
      type: 'serverDisconnected',
      serverUrl: SERVER_URL,
    });

    expect(disconnected.activeServerUrl).toBe(otherUrl);
  });

  it('lets the active server be selected explicitly', () => {
    const otherUrl = 'opc.tcp://127.0.0.1:4841';
    const withFirst = applyServerMessage(initialServerStoreState, {
      type: 'serverConnected',
      server: {
        serverUrl: SERVER_URL,
        status: 'connected',
        namespaceUris: [],
        isRoboticsServer: false,
        motionDeviceIds: [],
      },
    });
    const withSecond = applyServerMessage(withFirst, {
      type: 'serverConnected',
      server: {
        serverUrl: otherUrl,
        status: 'connected',
        namespaceUris: [],
        isRoboticsServer: false,
        motionDeviceIds: [],
      },
    });

    const selected = selectActiveServer(withSecond, SERVER_URL);

    expect(selected.activeServerUrl).toBe(SERVER_URL);
  });

  it('records method results and errors', () => {
    const withResult = applyServerMessage(initialServerStoreState, {
      type: 'methodResult',
      requestId: 'req-1',
      serverUrl: SERVER_URL,
      robotId: 'robot-a',
      nodeId: 'ns=4;s=method',
      result: { status: 'ok' },
    });
    const withError = applyServerMessage(withResult, {
      type: 'error',
      requestId: 'req-2',
      serverUrl: SERVER_URL,
      robotId: 'robot-a',
      message: 'Nope',
      code: 'demoError',
    });

    expect(withError.methodResults.length).toBe(1);
    expect(withError.errors).toEqual([
      {
        requestId: 'req-2',
        serverUrl: SERVER_URL,
        motionDeviceId: 'robot-a',
        message: 'Nope',
        code: 'demoError',
      },
    ]);
  });

  it('tracks method call lifecycle by request id', () => {
    const pending = trackMethodCallRequest(initialServerStoreState, {
      requestId: 'raw-method-1',
      serverUrl: SERVER_URL,
      nodeId: 'ns=4;s=Go To',
      method: 'raw',
    });
    const succeeded = applyServerMessage(pending, {
      type: 'methodResult',
      requestId: 'raw-method-1',
      serverUrl: SERVER_URL,
      nodeId: 'ns=4;s=Go To',
      result: { status: 'ok' },
    });
    const failedPending = trackMethodCallRequest(succeeded, {
      requestId: 'raw-method-2',
      serverUrl: SERVER_URL,
      nodeId: 'ns=4;s=Go To',
      method: 'raw',
    });
    const failed = applyServerMessage(failedPending, {
      type: 'error',
      requestId: 'raw-method-2',
      serverUrl: SERVER_URL,
      message: 'Call failed',
      code: 'rawMethodCallFailed',
    });

    expect(failed.methodCallStatuses['raw-method-1']?.status).toBe('succeeded');
    expect(failed.methodCallStatuses['raw-method-1']?.result).toEqual({
      status: 'ok',
    });
    expect(failed.methodCallStatuses['raw-method-2']?.status).toBe('failed');
    expect(failed.methodCallStatuses['raw-method-2']?.error?.message).toBe('Call failed');
    expect(failed.methodCallStatuses['raw-method-2']?.error?.code).toBe(
      'rawMethodCallFailed',
    );
  });

  it('stores subscribed node values and opc ua events', () => {
    const withNodeValue = applyServerMessage(initialServerStoreState, {
      type: 'nodeValueChanged',
      serverUrl: SERVER_URL,
      nodeId: 'ns=4;s=temperature',
      value: 21.5,
    });
    const withEvent = applyServerMessage(withNodeValue, {
      type: 'opcuaEvent',
      serverUrl: SERVER_URL,
      nodeId: 'ns=4;s=MotionDevice_EVA',
      event: { message: 'motion complete' },
    });

    expect(withEvent.nodeValues[`${SERVER_URL}::ns=4;s=temperature`]?.value).toBe(
      21.5,
    );
    expect(withEvent.opcuaEvents).toEqual([
      {
        serverUrl: SERVER_URL,
        nodeId: 'ns=4;s=MotionDevice_EVA',
        event: { message: 'motion complete' },
      },
    ]);
  });
});
