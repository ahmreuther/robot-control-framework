import { describe, expect, it } from 'vitest';

import type { RobotSessionInfo } from '../../entities/robot/model/types';
import { WscWebSocketClient, type WebSocketLike } from '../../shared/api/websocketClient';
import { createApplicationController } from './applicationController';

const SERVER_URL = 'opc.tcp://127.0.0.1:4840';

class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function robotSession(robotId = 'robot-a'): RobotSessionInfo {
  return {
    robotId,
    serverUrl: SERVER_URL,
    displayName: 'MotionDevice_EVA',
    motionDevice: {
      nodeId: `ns=4;s=${robotId}`,
    },
    info: {},
    opcua: {
      variables: {
        mode: 'ns=4;s=mode',
      },
      methods: {
        goto: {
          nodeId: 'ns=4;s=Go To',
          inputArguments: [
            { name: 'mode', arrayDimensions: [] },
            { name: 'joints', arrayDimensions: [] },
            { name: 'max-Speed', arrayDimensions: [] },
            { name: 'time', arrayDimensions: [] },
            { name: 'tcp_config', arrayDimensions: [] },
            { name: 'avoidance_zones', arrayDimensions: [] },
          ],
          outputArguments: [],
        },
        toggleEndEffector: {
          nodeId: 'ns=5;s=toggleEndEff',
          inputArguments: [],
          outputArguments: [],
        },
      },
      axes: {
        Axis_1: {
          axisName: 'Axis_1',
          axisNodeId: 'ns=4;s=Axis_1',
        },
        Axis_2: {
          axisName: 'Axis_2',
          axisNodeId: 'ns=4;s=Axis_2',
        },
      },
    },
    status: 'connected',
  };
}

function setup() {
  const socket = new FakeWebSocket();
  const client = new WscWebSocketClient('ws://backend/ws', () => socket);
  const controller = createApplicationController({ client });

  controller.connectWebSocket();
  socket.open();

  return { socket, controller };
}

describe('ApplicationController', () => {
  it('routes websocket messages into stores and per-robot joint runtime', () => {
    const { socket, controller } = setup();

    socket.receive({
      type: 'robotsDiscovered',
      serverUrl: SERVER_URL,
      robots: [robotSession()],
    });
    controller.updateRobotVisualBinding('robot-a', {
      orderedUrdfJointNames: ['joint_1', 'joint_2'],
    });

    const started = controller.startRobotSync('robot-a');
    socket.receive({
      type: 'robotJointState',
      serverUrl: SERVER_URL,
      robotId: 'robot-a',
      data: {
        axisValues: {
          Axis_1: 1,
          Axis_2: 2,
        },
        unit: 'C81',
      },
    });

    expect(started?.requestId).toBe('subscribe-joints-1');
    expect(controller.getSnapshot().robot.byId['robot-a']?.joints.axisValues).toEqual({
      Axis_1: 1,
      Axis_2: 2,
    });
    expect(controller.getJointRuntime().getManager('robot-a').getAngles()).toEqual([
      1,
      2,
    ]);
  });

  it('exposes lifecycle helpers for server, mode, node, and event subscriptions', () => {
    const { socket, controller } = setup();

    controller.connectServer(SERVER_URL);
    controller.discoverRobots(SERVER_URL);
    controller.subscribeRobotMode('robot-a');
    controller.unsubscribeRobotMode('robot-a');
    controller.subscribeNode(SERVER_URL, 'ns=4;s=temperature');
    controller.unsubscribeNode(SERVER_URL, 'ns=4;s=temperature');
    controller.subscribeEvent(SERVER_URL, 'ns=4;s=MotionDevice_EVA');
    controller.unsubscribeEvent(SERVER_URL, 'ns=4;s=MotionDevice_EVA');

    expect(socket.sent.map((raw) => JSON.parse(raw).type)).toEqual([
      'connectServer',
      'discoverRobots',
      'subscribeRobotMode',
      'unsubscribeRobotMode',
      'subscribeNode',
      'unsubscribeNode',
      'subscribeEvent',
      'unsubscribeEvent',
    ]);
  });

  it('builds safe goto and end-effector commands and tracks method status', () => {
    const { socket, controller } = setup();

    socket.receive({
      type: 'robotsDiscovered',
      serverUrl: SERVER_URL,
      robots: [robotSession()],
    });

    const gotoRequestId = controller.callRobotGoto('robot-a', {
      joints: [0, 0.1],
      maxSpeed: 0.5,
    });
    const toggleRequestId = controller.toggleEndEffector('robot-a');
    socket.receive({
      type: 'methodResult',
      requestId: gotoRequestId,
      serverUrl: SERVER_URL,
      robotId: 'robot-a',
      nodeId: 'ns=4;s=Go To',
      result: { status: 'ok' },
    });

    expect(socket.sent.map((raw) => JSON.parse(raw))).toEqual([
      {
        type: 'callRobotMethod',
        requestId: 'method-goto-1',
        robotId: 'robot-a',
        method: 'goto',
        inputs: {
          args: ['automatic', [0, 0.1], 0.5, 0, [], []],
        },
      },
      {
        type: 'callRobotMethod',
        requestId: 'method-toggleEndEffector-2',
        robotId: 'robot-a',
        method: 'toggleEndEffector',
        inputs: {
          args: [],
        },
      },
    ]);
    expect(toggleRequestId).toBe('method-toggleEndEffector-2');
    expect(
      controller.getSnapshot().server.methodCallStatuses[gotoRequestId]?.status,
    ).toBe('succeeded');
  });

  it('validates raw method commands and tracks them as advanced calls', () => {
    const { socket, controller } = setup();

    const requestId = controller.callRawMethod({
      serverUrl: SERVER_URL,
      nodeId: 'ns=4;s=RawMethod',
      inputs: {
        args: [1],
      },
    });

    expect(requestId).toBe('raw-method-1');
    expect(JSON.parse(socket.sent[0] ?? '{}')).toEqual({
      type: 'callRawMethod',
      requestId: 'raw-method-1',
      serverUrl: SERVER_URL,
      nodeId: 'ns=4;s=RawMethod',
      inputs: {
        args: [1],
      },
    });
    expect(controller.getSnapshot().server.methodCallStatuses[requestId]).toEqual({
      requestId,
      status: 'pending',
      serverUrl: SERVER_URL,
      nodeId: 'ns=4;s=RawMethod',
      method: 'raw',
    });
  });
});
