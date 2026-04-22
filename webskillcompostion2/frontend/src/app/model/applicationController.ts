import {
  applyRobotMessage,
  initialRobotStoreState,
  type RobotStoreState,
} from '../../entities/robot/model/store';
import type { Robot, RobotVisualBinding } from '../../entities/robot/model/types';
import {
  applyServerMessage,
  initialServerStoreState,
  trackMethodCallRequest,
  type ServerStoreState,
} from '../../entities/server/model/store';
import {
  WscWebSocketClient,
  type MessageLogListener,
  type StatusListener,
  type WebSocketClientStatus,
} from '../../shared/api/websocketClient';
import type { ServerMessage } from '../../shared/api/messages';
import {
  createRobotJointRuntime,
  type RobotJointRuntime,
  type RobotJointRuntimeStartResult,
} from '../../features/robot-control/model/robotJointRuntime';

export interface ApplicationSnapshot {
  server: ServerStoreState;
  robot: RobotStoreState;
}

export type ApplicationStateListener = (snapshot: ApplicationSnapshot) => void;

export interface StartRobotSyncResult {
  requestId: string | null;
  runtime: RobotJointRuntimeStartResult;
}

export interface RobotGotoCommand {
  joints: number[];
  mode?: string;
  maxSpeed?: number;
  time?: number;
  tcpConfig?: unknown;
  avoidanceZones?: unknown;
}

export interface ToggleEndEffectorCommand {
  value?: unknown;
}

export interface RawMethodCommand {
  serverUrl: string;
  nodeId: string;
  inputs?: Record<string, unknown>;
}

export interface ApplicationControllerOptions {
  client: WscWebSocketClient;
  jointRuntime?: RobotJointRuntime;
}

const DEFAULT_GOTO_MODE = 'automatic';
const DEFAULT_GOTO_SPEED = 1;
const DEFAULT_GOTO_TIME = 0;

export class ApplicationController {
  private serverState = initialServerStoreState;
  private robotState = initialRobotStoreState;
  private readonly client: WscWebSocketClient;
  private readonly jointRuntime: RobotJointRuntime;
  private readonly listeners = new Set<ApplicationStateListener>();
  private readonly unsubscribeClientMessage: () => void;

  constructor(options: ApplicationControllerOptions) {
    this.client = options.client;
    this.jointRuntime = options.jointRuntime ?? createRobotJointRuntime();
    this.unsubscribeClientMessage = this.client.onMessage((message) => {
      this.handleServerMessage(message);
    });
  }

  dispose(): void {
    this.unsubscribeClientMessage();
    this.listeners.clear();
    this.jointRuntime.clear();
  }

  getSnapshot(): ApplicationSnapshot {
    return {
      server: this.serverState,
      robot: this.robotState,
    };
  }

  getJointRuntime(): RobotJointRuntime {
    return this.jointRuntime;
  }

  getWebSocketStatus(): WebSocketClientStatus {
    return this.client.getStatus();
  }

  onWebSocketStatus(listener: StatusListener): () => void {
    return this.client.onStatus(listener);
  }

  onWebSocketMessageLog(listener: MessageLogListener): () => void {
    return this.client.onMessageLog(listener);
  }

  onStateChange(listener: ApplicationStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connectWebSocket(): void {
    this.client.connect();
  }

  disconnectWebSocket(): void {
    this.client.disconnect();
    this.jointRuntime.clear();
  }

  connectServer(serverUrl: string): string {
    return this.client.connectServer(serverUrl);
  }

  discoverRobots(serverUrl: string): string {
    return this.client.discoverRobots(serverUrl);
  }

  disconnectServer(serverUrl: string): string {
    return this.client.disconnectServer(serverUrl);
  }

  selectRobot(robotId: string): void {
    if (!this.robotState.byId[robotId]) {
      throw new Error(`Robot "${robotId}" is not known.`);
    }

    this.robotState = {
      ...this.robotState,
      activeRobotId: robotId,
    };
    this.emitState();
  }

  startRobotSync(robotId: string): StartRobotSyncResult | null {
    const robot = this.robotState.byId[robotId];
    if (!robot) return null;

    const runtime = this.jointRuntime.startSync(robot);
    if (!runtime.started) {
      return {
        requestId: null,
        runtime,
      };
    }

    return {
      requestId: this.client.subscribeRobotJoints(robotId),
      runtime,
    };
  }

  stopRobotSync(robotId: string): string {
    this.jointRuntime.stopSync(robotId);
    return this.client.unsubscribeRobotJoints(robotId);
  }

  updateRobotVisualBinding(
    robotId: string,
    visual: Partial<RobotVisualBinding>,
  ): void {
    const robot = this.requireRobot(robotId);
    this.robotState = {
      ...this.robotState,
      byId: {
        ...this.robotState.byId,
        [robotId]: {
          ...robot,
          visual: {
            ...robot.visual,
            ...visual,
          },
        },
      },
    };
    this.emitState();
  }

  subscribeRobotMode(robotId: string): string {
    return this.client.subscribeRobotMode(robotId);
  }

  unsubscribeRobotMode(robotId: string): string {
    return this.client.unsubscribeRobotMode(robotId);
  }

  subscribeNode(serverUrl: string, nodeId: string): string {
    assertNonEmpty('nodeId', nodeId);
    return this.client.subscribeNode(serverUrl, nodeId);
  }

  unsubscribeNode(serverUrl: string, nodeId: string): string {
    assertNonEmpty('nodeId', nodeId);
    return this.client.unsubscribeNode(serverUrl, nodeId);
  }

  subscribeEvent(serverUrl: string, nodeId: string): string {
    assertNonEmpty('nodeId', nodeId);
    return this.client.subscribeEvent(serverUrl, nodeId);
  }

  unsubscribeEvent(serverUrl: string, nodeId: string): string {
    assertNonEmpty('nodeId', nodeId);
    return this.client.unsubscribeEvent(serverUrl, nodeId);
  }

  callRobotGoto(robotId: string, command: RobotGotoCommand): string {
    const robot = this.requireRobot(robotId);
    validateJointArray(command.joints);
    const inputs = buildGotoInputs(robot, command);
    const requestId = this.client.callRobotMethod(robotId, 'goto', inputs);
    this.trackPendingMethodCall({
      requestId,
      serverUrl: robot.serverUrl,
      robotId,
      method: 'goto',
      nodeId: robot.opcua.methods.goto?.nodeId,
    });
    return requestId;
  }

  toggleEndEffector(robotId: string, command: ToggleEndEffectorCommand = {}): string {
    const robot = this.requireRobot(robotId);
    const method = robot.opcua.methods.toggleEndEffector;
    if (!method) {
      throw new Error(`Robot "${robotId}" has no discovered toggleEndEffector method.`);
    }

    const inputs =
      command.value === undefined ? { args: [] } : { args: [command.value] };
    const requestId = this.client.callRobotMethod(
      robotId,
      'toggleEndEffector',
      inputs,
    );
    this.trackPendingMethodCall({
      requestId,
      serverUrl: robot.serverUrl,
      robotId,
      method: 'toggleEndEffector',
      nodeId: method.nodeId,
    });
    return requestId;
  }

  callRawMethod(command: RawMethodCommand): string {
    assertNonEmpty('serverUrl', command.serverUrl);
    assertNonEmpty('nodeId', command.nodeId);
    const inputs = command.inputs ?? {};
    const requestId = this.client.callRawMethod(
      command.serverUrl,
      command.nodeId,
      inputs,
    );
    this.trackPendingMethodCall({
      requestId,
      serverUrl: command.serverUrl,
      nodeId: command.nodeId,
      method: 'raw',
    });
    return requestId;
  }

  private handleServerMessage(message: ServerMessage): void {
    if (message.type === 'serverDisconnected') {
      this.removeRuntimeForServer(message.serverUrl);
    }

    this.serverState = applyServerMessage(this.serverState, message);
    this.robotState = applyRobotMessage(this.robotState, message);

    if (message.type === 'robotJointState') {
      this.jointRuntime.update(message.robotId, message.data);
    }

    this.emitState();
  }

  private removeRuntimeForServer(serverUrl: string): void {
    for (const robot of Object.values(this.robotState.byId)) {
      if (robot.serverUrl === serverUrl) {
        this.jointRuntime.removeRobot(robot.robotId);
      }
    }
  }

  private requireRobot(robotId: string): Robot {
    const robot = this.robotState.byId[robotId];
    if (!robot) {
      throw new Error(`Robot "${robotId}" is not known.`);
    }
    return robot;
  }

  private trackPendingMethodCall(
    request: Parameters<typeof trackMethodCallRequest>[1],
  ): void {
    this.serverState = trackMethodCallRequest(this.serverState, request);
    this.emitState();
  }

  private emitState(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export function createApplicationController(
  options: ApplicationControllerOptions,
): ApplicationController {
  return new ApplicationController(options);
}

function buildGotoInputs(
  robot: Robot,
  command: RobotGotoCommand,
): Record<string, unknown> {
  const method = robot.opcua.methods.goto;
  if (!method) {
    throw new Error(`Robot "${robot.robotId}" has no discovered goto method.`);
  }
  if (method.inputArguments.length === 0) {
    throw new Error(
      `Robot "${robot.robotId}" goto method has no discovered input signature.`,
    );
  }

  const args = method.inputArguments.map((argument) => {
    const name = normalizeArgumentName(argument.name ?? '');
    if (name === 'mode') return command.mode ?? DEFAULT_GOTO_MODE;
    if (name.includes('joint')) return command.joints;
    if (name.includes('speed')) return command.maxSpeed ?? DEFAULT_GOTO_SPEED;
    if (name === 'time') return command.time ?? DEFAULT_GOTO_TIME;
    if (name === 'tcpconfig') return command.tcpConfig ?? [];
    if (name === 'avoidancezones') return command.avoidanceZones ?? [];

    throw new Error(
      `Cannot build goto input for unsupported argument "${argument.name ?? name}".`,
    );
  });

  return { args };
}

function normalizeArgumentName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function validateJointArray(joints: number[]): void {
  if (!Array.isArray(joints) || joints.length === 0) {
    throw new Error('Goto command requires at least one joint value.');
  }

  for (const value of joints) {
    if (!Number.isFinite(value)) {
      throw new Error('Goto joint values must be finite numbers.');
    }
  }
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim() === '') {
    throw new Error(`${name} must not be empty.`);
  }
}
