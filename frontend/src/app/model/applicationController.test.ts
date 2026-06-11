import { describe, expect, it } from 'vitest';

import type { RobotSessionInfo } from '../../entities/robot/model/types';
import { ROBOT_MODEL_OPTIONS } from '../../features/robot-control/model/robotModels';
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
        toggleEndEffector: {
          nodeId: 'ns=5;s=toggleEndEff',
          inputArguments: [],
          outputArguments: [],
        },
      },
      skills: {
        go_to: {
          nodeId: 'ns=4;s=Go To Skill',
          parameterSetNodeId: 'ns=4;s=Go To Skill.ParameterSet',
          resultSetNodeId: 'ns=4;s=Go To Skill.ResultSet',
          currentStateNodeId: 'ns=4;s=Go To Skill.CurrentState',
          startNodeId: 'ns=4;s=Go To Skill.Start',
          haltNodeId: 'ns=4;s=Go To Skill.Halt',
          resetNodeId: 'ns=4;s=Go To Skill.Reset',
          parameters: {},
          results: {},
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
    actions: {
      goto: {
        kind: 'skill',
        targetName: 'go_to',
        skillNodeId: 'ns=4;s=Go To Skill',
        parameterSetNodeId: 'ns=4;s=Go To Skill.ParameterSet',
        resultSetNodeId: 'ns=4;s=Go To Skill.ResultSet',
        currentStateNodeId: 'ns=4;s=Go To Skill.CurrentState',
        startNodeId: 'ns=4;s=Go To Skill.Start',
        haltNodeId: 'ns=4;s=Go To Skill.Halt',
        resetNodeId: 'ns=4;s=Go To Skill.Reset',
        parameterNames: [
          'mode',
          'joints',
          'max_speed',
          'time',
          'tcp_config',
          'avoidance_zones',
        ],
        resultNames: [],
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

function createBoundRobot(controller: ReturnType<typeof createApplicationController>) {
  const robotId = controller.createRobot('Manual EVA', ROBOT_MODEL_OPTIONS[0], {
    x: 0,
    y: 0,
    z: 0,
    roll: 0,
    pitch: 0,
    yaw: 0,
  });
  controller.bindRobotToMotionDevice(robotId, 'robot-a');
  return robotId;
}

describe('ApplicationController', () => {
  it('routes websocket messages into stores and per-robot joint runtime', () => {
    const { socket, controller } = setup();

    socket.receive({
      type: 'robotsDiscovered',
      serverUrl: SERVER_URL,
      robots: [robotSession()],
    });
    const robotId = createBoundRobot(controller);
    controller.updateRobotVisualBinding(robotId, {
      orderedUrdfJointNames: ['joint_1', 'joint_2'],
    });

    const started = controller.startRobotSync(robotId);
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
    expect(controller.getSnapshot().robot.byId[robotId]?.joints.axisValues).toEqual({});
    expect(controller.getJointRuntime().getManager(robotId).getAngles()).toEqual([
      1,
      2,
    ]);
  });

  it('exposes lifecycle helpers for server, mode, node, and event subscriptions', () => {
    const { socket, controller } = setup();
    socket.receive({
      type: 'robotsDiscovered',
      serverUrl: SERVER_URL,
      robots: [robotSession()],
    });
    const robotId = createBoundRobot(controller);

    controller.connectServer(SERVER_URL);
    controller.discoverRobots(SERVER_URL);
    controller.subscribeRobotMode(robotId);
    controller.unsubscribeRobotMode(robotId);
    controller.subscribeNode(SERVER_URL, 'ns=4;s=temperature');
    controller.unsubscribeNode(SERVER_URL, 'ns=4;s=temperature');
    controller.subscribeEvent(SERVER_URL, 'ns=4;s=MotionDevice_EVA');
    controller.unsubscribeEvent(SERVER_URL, 'ns=4;s=MotionDevice_EVA');
    controller.browseAddressSpaceRoot(SERVER_URL);
    controller.browseAddressSpaceChildren(SERVER_URL, 'i=85');
    controller.browseAddressSpaceReferences(SERVER_URL, 'i=85');
    controller.browseAddressSpaceNodeDetails(SERVER_URL, 'i=85');

    expect(socket.sent.map((raw) => JSON.parse(raw).type)).toEqual([
      'connectServer',
      'discoverRobots',
      'subscribeRobotMode',
      'unsubscribeRobotMode',
      'subscribeNode',
      'unsubscribeNode',
      'subscribeEvent',
      'unsubscribeEvent',
      'browseAddressSpaceRoot',
      'browseAddressSpaceChildren',
      'browseAddressSpaceReferences',
      'browseAddressSpaceNodeDetails',
    ]);
  });

  it('builds safe goto and end-effector commands and tracks method status', () => {
    const { socket, controller } = setup();

    socket.receive({
      type: 'robotsDiscovered',
      serverUrl: SERVER_URL,
      robots: [robotSession()],
    });
    const robotId = createBoundRobot(controller);

    const gotoRequestId = controller.callRobotGoto(robotId, {
      joints: [0, 0.1],
      maxSpeed: 0.5,
    });
    const toggleRequestId = controller.toggleEndEffector(robotId);
    socket.receive({
      type: 'methodResult',
      requestId: gotoRequestId,
      serverUrl: SERVER_URL,
      robotId: 'robot-a',
      nodeId: 'ns=4;s=Go To Skill',
      result: { status: 'ok' },
    });

    expect(socket.sent.map((raw) => JSON.parse(raw))).toEqual([
      {
        type: 'executeRobotAction',
        requestId: 'action-goto-1',
        robotId: 'robot-a',
        actionName: 'goto',
        inputs: {
          mode: 'automatic',
          joints: [0, 0.1],
          max_speed: 0.5,
          time: -1,
          tcp_config: '',
          avoidance_zones: '',
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

  it('maps visual joint angles into axis order when sending goto commands', () => {
    const { socket, controller } = setup();

    socket.receive({
      type: 'robotsDiscovered',
      serverUrl: SERVER_URL,
      robots: [robotSession()],
    });
    const robotId = createBoundRobot(controller);
    controller.updateRobotVisualBinding(robotId, {
      orderedUrdfJointNames: ['joint_1', 'joint_2'],
      axisToJointName: {
        Axis_1: 'joint_2',
        Axis_2: 'joint_1',
      },
    });
    controller.getJointRuntime().getManager(robotId).setJointNames(['joint_1', 'joint_2']);

    const requestId = controller.callRobotGotoForVisualAngles(robotId, [10, 20]);

    expect(requestId).toBe('action-goto-1');
    expect(JSON.parse(socket.sent[0] ?? '{}')).toEqual({
      type: 'executeRobotAction',
      requestId: 'action-goto-1',
      robotId: 'robot-a',
      actionName: 'goto',
      inputs: {
        mode: 'automatic',
        joints: [20, 10],
        max_speed: -1,
        time: -1,
        tcp_config: '',
        avoidance_zones: '',
      },
    });
  });

  it('clears the sync goto flight lock when the goto skill returns to Ready', () => {
    const { socket, controller } = setup();

    socket.receive({
      type: 'robotsDiscovered',
      serverUrl: SERVER_URL,
      robots: [robotSession()],
    });
    const robotId = createBoundRobot(controller);
    controller.updateRobotVisualBinding(robotId, {
      orderedUrdfJointNames: ['joint_1', 'joint_2'],
    });

    controller.getJointRuntime().markSyncGotoInFlight(robotId, 'action-goto-42');
    expect(controller.getJointRuntime().hasInFlightSyncGoto(robotId)).toBe(true);

    socket.receive({
      type: 'robotActionState',
      serverUrl: SERVER_URL,
      robotId: 'robot-a',
      data: {
        actionName: 'goto',
        kind: 'skill',
        status: 'idle',
        currentState: 'Ready',
      },
    });

    expect(controller.getJointRuntime().hasInFlightSyncGoto(robotId)).toBe(false);
  });

  it('blocks sending another goto while the goto skill is still active', () => {
    const { socket, controller } = setup();

    socket.receive({
      type: 'robotsDiscovered',
      serverUrl: SERVER_URL,
      robots: [robotSession()],
    });
    const robotId = createBoundRobot(controller);
    socket.receive({
      type: 'robotActionState',
      serverUrl: SERVER_URL,
      robotId: 'robot-a',
      data: {
        actionName: 'goto',
        kind: 'skill',
        status: 'running',
        currentState: 'Running',
      },
    });

    let caught: unknown = null;
    try {
      controller.callRobotGoto(robotId, {
        joints: [0, 0.1],
      });
    } catch (error) {
      caught = error;
    }

    expect(caught instanceof Error).toBe(true);
    expect((caught as Error).message.includes('goto skill is still active')).toBe(true);
  });

  it('stops sync immediately when a robot is rebound or unbound', () => {
    const { socket, controller } = setup();

    socket.receive({
      type: 'robotsDiscovered',
      serverUrl: SERVER_URL,
      robots: [robotSession()],
    });
    const robotId = createBoundRobot(controller);
    controller.updateRobotVisualBinding(robotId, {
      orderedUrdfJointNames: ['joint_1', 'joint_2'],
    });

    controller.startRobotSync(robotId);
    controller.getJointRuntime().markSyncGotoInFlight(robotId, 'action-goto-42');
    controller.bindRobotToMotionDevice(robotId, null);

    expect(controller.getJointRuntime().isSyncing(robotId)).toBe(false);
    expect(controller.getJointRuntime().hasInFlightSyncGoto(robotId)).toBe(false);
  });

  it('stops sync immediately when disconnecting a server', () => {
    const { socket, controller } = setup();

    socket.receive({
      type: 'robotsDiscovered',
      serverUrl: SERVER_URL,
      robots: [robotSession()],
    });
    const robotId = createBoundRobot(controller);
    controller.updateRobotVisualBinding(robotId, {
      orderedUrdfJointNames: ['joint_1', 'joint_2'],
    });

    controller.startRobotSync(robotId);
    controller.getJointRuntime().markSyncGotoInFlight(robotId, 'action-goto-42');
    controller.disconnectServer(SERVER_URL);

    expect(controller.getJointRuntime().isSyncing(robotId)).toBe(false);
    expect(controller.getJointRuntime().hasInFlightSyncGoto(robotId)).toBe(false);
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

  it('sends generic action commands and stores robot action state updates', () => {
    const { socket, controller } = setup();

    socket.receive({
      type: 'robotsDiscovered',
      serverUrl: SERVER_URL,
      robots: [robotSession()],
    });
    const robotId = createBoundRobot(controller);

    const executeRequestId = controller.executeRobotAction(robotId, 'goto', {
      mode: 'automatic',
      joints: [0, 0.1],
    });
    const haltRequestId = controller.haltRobotAction(robotId, 'goto');
    const resetRequestId = controller.resetRobotAction(robotId, 'goto');
    socket.receive({
      type: 'robotActionState',
      requestId: executeRequestId,
      serverUrl: SERVER_URL,
      robotId: 'robot-a',
      data: {
        actionName: 'goto',
        kind: 'skill',
        status: 'running',
        currentState: 'Running',
      },
    });

    expect(socket.sent.slice(-3).map((raw) => JSON.parse(raw))).toEqual([
      {
        type: 'executeRobotAction',
        requestId: 'action-goto-1',
        robotId: 'robot-a',
        actionName: 'goto',
        inputs: {
          mode: 'automatic',
          joints: [0, 0.1],
        },
      },
      {
        type: 'haltRobotAction',
        requestId: 'halt-action-goto-2',
        robotId: 'robot-a',
        actionName: 'goto',
      },
      {
        type: 'resetRobotAction',
        requestId: 'reset-action-goto-3',
        robotId: 'robot-a',
        actionName: 'goto',
      },
    ]);
    expect(haltRequestId).toBe('halt-action-goto-2');
    expect(resetRequestId).toBe('reset-action-goto-3');
    expect(
      controller.getSnapshot().robot.byId[robotId]?.actionStates.goto,
    ).toEqual({
      actionName: 'goto',
      kind: 'skill',
      status: 'running',
      currentState: 'Running',
    });
  });

  it('creates a local robot instance and selects it', () => {
    const { controller } = setup();

    const robotId = controller.createRobot('Manual EVA', ROBOT_MODEL_OPTIONS[0], {
      x: 1,
      y: 2,
      z: 3,
      roll: 0,
      pitch: 0,
      yaw: 0,
    });
    const snapshot = controller.getSnapshot();

    expect(snapshot.robot.activeRobotId).toBe(robotId);
    expect(snapshot.robot.byId[robotId]).toEqual({
      robotId,
      motionDeviceId: null,
      serverUrl: 'local://manual',
      displayName: 'Manual EVA',
      motionDevice: {
        nodeId: `manual:${robotId}`,
        displayName: 'Manual EVA',
        browseName: 'Manual EVA',
      },
      info: {},
      opcua: {
        variables: {},
        methods: {},
        skills: {},
        axes: {},
      },
      actions: {},
      status: 'unknown',
      joints: {
        axisValues: {},
        unit: null,
      },
      actionStates: {},
      mode: null,
      homeAngles: [
        0,
        0,
        -Math.PI / 2,
        0,
        -Math.PI / 2,
        0,
      ],
      visual: {
        urdfId: 'eva',
        urdfLabel: 'EVA',
        urdfUrl: '/urdf/eva_description/urdf/eva_description.urdf',
        origin: {
          x: 1,
          y: 2,
          z: 3,
          roll: 0,
          pitch: 0,
          yaw: 0,
        },
        orderedUrdfJointNames: [
          'joint_1',
          'joint_2',
          'joint_3',
          'joint_4',
          'joint_5',
          'joint_6',
        ],
        allUrdfJointNames: [
          'joint_1',
          'joint_2',
          'joint_3',
          'joint_4',
          'joint_5',
          'joint_6',
        ],
        axisToJointName: {},
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
    });
    expect(controller.getJointRuntime().getExistingManager(robotId) !== null).toBe(true);
  });

  it('lets the active server be selected explicitly', () => {
    const { socket, controller } = setup();
    const otherUrl = 'opc.tcp://127.0.0.1:4841';

    socket.receive({
      type: 'serverConnected',
      server: {
        serverUrl: SERVER_URL,
        status: 'connected',
        namespaceUris: [],
        isRoboticsServer: true,
        motionDeviceIds: [],
      },
    });
    socket.receive({
      type: 'serverConnected',
      server: {
        serverUrl: otherUrl,
        status: 'connected',
        namespaceUris: [],
        isRoboticsServer: false,
        motionDeviceIds: [],
      },
    });

    controller.selectServer(SERVER_URL);

    expect(controller.getSnapshot().server.activeServerUrl).toBe(SERVER_URL);
  });

  it('tracks address-space browse and selection state by server', () => {
    const { socket, controller } = setup();

    const rootRequestId = controller.browseAddressSpaceRoot(SERVER_URL);
    expect(
      controller.getSnapshot().server.addressSpace.byServerUrl[SERVER_URL]
        ?.rootRequestStatus,
    ).toBe('loading');
    socket.receive({
      type: 'addressSpaceRoot',
      requestId: rootRequestId,
      serverUrl: SERVER_URL,
      nodes: [
        {
          nodeId: 'i=85',
          displayName: 'Objects',
          browseName: 'Objects',
          nodeClass: 'Object',
          hasChildren: true,
        },
      ],
    });
    controller.selectAddressSpaceNode(SERVER_URL, 'i=85');
    controller.setAddressSpaceExpandedNodeIds(SERVER_URL, ['i=85']);
    const referencesRequestId = controller.browseAddressSpaceReferences(
      SERVER_URL,
      'i=85',
    );
    const detailsRequestId = controller.browseAddressSpaceNodeDetails(
      SERVER_URL,
      'i=85',
    );
    socket.receive({
      type: 'addressSpaceReferences',
      requestId: referencesRequestId,
      serverUrl: SERVER_URL,
      nodeId: 'i=85',
      references: [
        {
          referenceType: 'Organizes (i=35)',
          nodeId: 'i=86',
          browseName: '0:Types',
          typeDefinition: 'FolderType (i=61)',
        },
      ],
    });
    socket.receive({
      type: 'addressSpaceNodeDetails',
      requestId: detailsRequestId,
      serverUrl: SERVER_URL,
      nodeId: 'i=85',
      details: {
        nodeId: 'i=85',
        browseName: '0:Objects',
        displayName: 'Objects',
        nodeClass: 'Object',
        nodeClassValue: 1,
        description: 'Objects folder',
        value: null,
        dataType: null,
        eventNotifier: '0',
      },
    });

    const snapshot = controller.getSnapshot();
    expect(snapshot.server.addressSpace.byServerUrl[SERVER_URL]?.rootNodeIds).toEqual([
      'i=85',
    ]);
    expect(
      snapshot.server.addressSpace.byServerUrl[SERVER_URL]?.rootRequestStatus,
    ).toBe('succeeded');
    expect(snapshot.server.addressSpace.byServerUrl[SERVER_URL]?.selectedNodeId).toBe(
      'i=85',
    );
    expect(snapshot.server.addressSpace.byServerUrl[SERVER_URL]?.expandedNodeIds).toEqual([
      'i=85',
    ]);
    expect(
      snapshot.server.addressSpace.byServerUrl[SERVER_URL]?.referencesByNodeId['i=85'],
    ).toEqual([
      {
        referenceType: 'Organizes (i=35)',
        nodeId: 'i=86',
        browseName: '0:Types',
        typeDefinition: 'FolderType (i=61)',
      },
    ]);
    expect(
      snapshot.server.addressSpace.byServerUrl[SERVER_URL]?.detailsByNodeId['i=85'],
    ).toEqual({
      nodeId: 'i=85',
      browseName: '0:Objects',
      displayName: 'Objects',
      nodeClass: 'Object',
      nodeClassValue: 1,
      description: 'Objects folder',
      value: null,
      dataType: null,
      eventNotifier: '0',
    });
    expect(
      snapshot.server.addressSpace.byServerUrl[SERVER_URL]?.referenceRequestStatusByNodeId[
        'i=85'
      ],
    ).toBe('succeeded');
    expect(
      snapshot.server.addressSpace.byServerUrl[SERVER_URL]?.detailRequestStatusByNodeId[
        'i=85'
      ],
    ).toBe('succeeded');
  });

  it('marks failed address-space requests explicitly without needing resend heuristics', () => {
    const { socket, controller } = setup();

    const requestId = controller.browseAddressSpaceNodeDetails(SERVER_URL, 'i=85');

    expect(
      controller.getSnapshot().server.addressSpace.byServerUrl[SERVER_URL]
        ?.detailRequestStatusByNodeId['i=85'],
    ).toBe('loading');

    socket.receive({
      type: 'error',
      requestId,
      serverUrl: SERVER_URL,
      message: 'Failed to browse address space node details for i=85',
      code: 'addressSpaceBrowseFailed',
    });

    expect(
      controller.getSnapshot().server.addressSpace.byServerUrl[SERVER_URL]
        ?.detailRequestStatusByNodeId['i=85'],
    ).toBe('failed');
  });

  it('tracks optimistic variable and event subscriptions by node', () => {
    const { controller } = setup();

    controller.subscribeNode(SERVER_URL, 'i=85');
    controller.subscribeEvent(SERVER_URL, 'i=85');

    let snapshot = controller.getSnapshot();
    expect(snapshot.server.subscribedNodeKeys).toEqual([`${SERVER_URL}::i=85`]);
    expect(snapshot.server.subscribedEventNodeKeys).toEqual([
      `${SERVER_URL}::i=85`,
    ]);

    controller.unsubscribeNode(SERVER_URL, 'i=85');
    controller.unsubscribeEvent(SERVER_URL, 'i=85');

    snapshot = controller.getSnapshot();
    expect(snapshot.server.subscribedNodeKeys).toEqual([]);
    expect(snapshot.server.subscribedEventNodeKeys).toEqual([]);
  });
});
