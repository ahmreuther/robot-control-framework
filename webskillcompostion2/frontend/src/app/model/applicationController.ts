import {
  applyRobotMessage,
  initialRobotStoreState,
  type RobotStoreState,
} from '../../entities/robot/model/store';
import {
  createLocalRobot,
  bindRobotToMotionDevice,
  unbindRobotFromMotionDevice,
  type Robot,
  type RobotPanelState,
  type RobotVisualBinding,
} from '../../entities/robot/model/types';
import type {
  RobotModelConfig,
  RobotOrigin,
} from '../../features/robot-control/model/robotModels';
import {
  applyServerMessage,
  requestAddressSpaceChildren,
  requestAddressSpaceNodeDetails,
  requestAddressSpaceReferences,
  requestAddressSpaceRoot,
  initialServerStoreState,
  markEventSubscription,
  markNodeSubscription,
  selectAddressSpaceNode,
  selectActiveServer,
  setExpandedAddressSpaceNodes,
  trackMethodCallRequest,
  unmarkEventSubscription,
  unmarkNodeSubscription,
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
import { mapVisualAnglesToAxisValues } from '../../features/robot-control/model/axisMapping';

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
  private localRobotCounter = 0;
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
    this.removeRuntimeForServer(serverUrl);
    return this.client.disconnectServer(serverUrl);
  }

  selectServer(serverUrl: string | null): void {
    this.serverState = selectActiveServer(this.serverState, serverUrl);
    this.emitState();
  }

  browseAddressSpaceRoot(serverUrl: string): string {
    assertNonEmpty('serverUrl', serverUrl);
    const requestId = this.client.browseAddressSpaceRoot(serverUrl);
    this.serverState = requestAddressSpaceRoot(this.serverState, serverUrl, requestId);
    this.emitState();
    return requestId;
  }

  browseAddressSpaceChildren(serverUrl: string, nodeId: string): string {
    assertNonEmpty('serverUrl', serverUrl);
    assertNonEmpty('nodeId', nodeId);
    const requestId = this.client.browseAddressSpaceChildren(serverUrl, nodeId);
    this.serverState = requestAddressSpaceChildren(
      this.serverState,
      serverUrl,
      nodeId,
      requestId,
    );
    this.emitState();
    return requestId;
  }

  browseAddressSpaceReferences(serverUrl: string, nodeId: string): string {
    assertNonEmpty('serverUrl', serverUrl);
    assertNonEmpty('nodeId', nodeId);
    const requestId = this.client.browseAddressSpaceReferences(serverUrl, nodeId);
    this.serverState = requestAddressSpaceReferences(
      this.serverState,
      serverUrl,
      nodeId,
      requestId,
    );
    this.emitState();
    return requestId;
  }

  browseAddressSpaceNodeDetails(serverUrl: string, nodeId: string): string {
    assertNonEmpty('serverUrl', serverUrl);
    assertNonEmpty('nodeId', nodeId);
    const requestId = this.client.browseAddressSpaceNodeDetails(serverUrl, nodeId);
    this.serverState = requestAddressSpaceNodeDetails(
      this.serverState,
      serverUrl,
      nodeId,
      requestId,
    );
    this.emitState();
    return requestId;
  }

  selectAddressSpaceNode(serverUrl: string, nodeId: string | null): void {
    assertNonEmpty('serverUrl', serverUrl);
    this.serverState = selectAddressSpaceNode(this.serverState, serverUrl, nodeId);
    this.emitState();
  }

  setAddressSpaceExpandedNodeIds(serverUrl: string, nodeIds: string[]): void {
    assertNonEmpty('serverUrl', serverUrl);
    this.serverState = setExpandedAddressSpaceNodes(this.serverState, serverUrl, nodeIds);
    this.emitState();
  }

  createRobot(
    displayName: string,
    model: RobotModelConfig,
    origin: RobotOrigin,
  ): string {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      throw new Error('Robot name must not be empty.');
    }

    this.localRobotCounter += 1;
    const robotId = `manual-robot-${this.localRobotCounter}`;
    const nextRobot = {
      ...createLocalRobot(robotId, trimmedName),
      homeAngles: model.homeAngles ? [...model.homeAngles] : null,
      visual: {
        urdfId: model.id,
        urdfLabel: model.label,
        urdfUrl: model.url,
        origin: {
          x: origin.x,
          y: origin.y,
          z: origin.z,
        },
        orderedUrdfJointNames: [...model.orderedUrdfJointNames],
        allUrdfJointNames: [...model.orderedUrdfJointNames],
        axisToJointName: {},
      },
    };

    this.robotState = {
      ...this.robotState,
      byId: {
        ...this.robotState.byId,
        [robotId]: nextRobot,
      },
      activeRobotId: robotId,
    };
    this.jointRuntime.configureRobot(nextRobot);
    this.emitState();
    return robotId;
  }

  bindRobotToMotionDevice(robotId: string, motionDeviceId: string | null): void {
    const robot = this.requireRobot(robotId);
    if (robot.motionDeviceId !== motionDeviceId) {
      this.jointRuntime.stopSync(robotId);
    }
    const nextRobot =
      motionDeviceId === null
        ? unbindRobotFromMotionDevice(robot)
        : (() => {
            const motionDevice = this.serverState.motionDevicesById[motionDeviceId];
            if (!motionDevice) {
              throw new Error(`Motion device "${motionDeviceId}" is not known.`);
            }
            return bindRobotToMotionDevice(robot, motionDevice);
          })();

    this.robotState = {
      ...this.robotState,
      byId: {
        ...this.robotState.byId,
        [robotId]: nextRobot,
      },
    };
    this.emitState();
  }

  removeRobot(robotId: string): void {
    if (!this.robotState.byId[robotId]) {
      return;
    }

    const nextById = { ...this.robotState.byId };
    delete nextById[robotId];
    this.jointRuntime.removeRobot(robotId);

    const remainingRobotIds = Object.keys(nextById);
    this.robotState = {
      ...this.robotState,
      byId: nextById,
      activeRobotId:
        this.robotState.activeRobotId === robotId
          ? remainingRobotIds[0] ?? null
          : this.robotState.activeRobotId,
    };
    this.emitState();
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
    const robot = this.requireRobot(robotId);
    const motionDeviceId = robot.motionDeviceId;
    if (!motionDeviceId) return null;

    const runtime = this.jointRuntime.startSync(robot);
    if (!runtime.started) {
      return {
        requestId: null,
        runtime,
      };
    }

    return {
      requestId: this.client.subscribeRobotJoints(motionDeviceId),
      runtime,
    };
  }

  stopRobotSync(robotId: string): string {
    const motionDeviceId = this.robotState.byId[robotId]?.motionDeviceId;
    this.jointRuntime.stopSync(robotId);
    return motionDeviceId ? this.client.unsubscribeRobotJoints(motionDeviceId) : '';
  }

  updateRobotVisualBinding(
    robotId: string,
    visual: Partial<RobotVisualBinding>,
  ): void {
    const robot = this.requireRobot(robotId);
    const nextRobot = {
      ...robot,
      visual: {
        ...robot.visual,
        ...visual,
      },
    };
    this.robotState = {
      ...this.robotState,
      byId: {
        ...this.robotState.byId,
        [robotId]: nextRobot,
      },
    };
    this.jointRuntime.configureRobot(nextRobot);
    this.emitState();
  }

  updateRobotPanelState(
    robotId: string,
    panel: Partial<RobotPanelState>,
  ): void {
    const robot = this.requireRobot(robotId);
    this.robotState = {
      ...this.robotState,
      byId: {
        ...this.robotState.byId,
        [robotId]: {
          ...robot,
          panel: {
            ...robot.panel,
            ...panel,
          },
        },
      },
    };
    this.emitState();
  }

  updateRobotHomeAngles(robotId: string, homeAngles: number[]): void {
    const robot = this.requireRobot(robotId);
    const nextRobot = {
      ...robot,
      homeAngles: [...homeAngles],
    };
    this.robotState = {
      ...this.robotState,
      byId: {
        ...this.robotState.byId,
        [robotId]: nextRobot,
      },
    };
    this.jointRuntime.configureRobot(nextRobot);
    this.emitState();
  }

  updateRobotJointAngles(robotId: string, angles: number[]): boolean {
    this.requireRobot(robotId);
    return this.jointRuntime.updateManualAngles(robotId, angles);
  }

  subscribeRobotMode(robotId: string): string {
    return this.client.subscribeRobotMode(this.requireBoundMotionDeviceId(robotId));
  }

  unsubscribeRobotMode(robotId: string): string {
    return this.client.unsubscribeRobotMode(this.requireBoundMotionDeviceId(robotId));
  }

  subscribeNode(serverUrl: string, nodeId: string): string {
    assertNonEmpty('serverUrl', serverUrl);
    assertNonEmpty('nodeId', nodeId);
    this.serverState = markNodeSubscription(this.serverState, serverUrl, nodeId);
    this.emitState();
    return this.client.subscribeNode(serverUrl, nodeId);
  }

  unsubscribeNode(serverUrl: string, nodeId: string): string {
    assertNonEmpty('serverUrl', serverUrl);
    assertNonEmpty('nodeId', nodeId);
    this.serverState = unmarkNodeSubscription(this.serverState, serverUrl, nodeId);
    this.emitState();
    return this.client.unsubscribeNode(serverUrl, nodeId);
  }

  subscribeEvent(serverUrl: string, nodeId: string): string {
    assertNonEmpty('serverUrl', serverUrl);
    assertNonEmpty('nodeId', nodeId);
    this.serverState = markEventSubscription(this.serverState, serverUrl, nodeId);
    this.emitState();
    return this.client.subscribeEvent(serverUrl, nodeId);
  }

  unsubscribeEvent(serverUrl: string, nodeId: string): string {
    assertNonEmpty('serverUrl', serverUrl);
    assertNonEmpty('nodeId', nodeId);
    this.serverState = unmarkEventSubscription(this.serverState, serverUrl, nodeId);
    this.emitState();
    return this.client.unsubscribeEvent(serverUrl, nodeId);
  }

  callRobotGoto(robotId: string, command: RobotGotoCommand): string {
    const robot = this.requireRobot(robotId);
    const motionDeviceId = this.requireBoundMotionDeviceId(robotId);
    validateJointArray(command.joints);
    const inputs = buildGotoInputs(robot, command);
    const requestId = this.client.callRobotMethod(motionDeviceId, 'goto', inputs);
    this.trackPendingMethodCall({
      requestId,
      serverUrl: robot.serverUrl,
      motionDeviceId,
      method: 'goto',
      nodeId: robot.opcua.methods.goto?.nodeId,
    });
    return requestId;
  }

  callRobotGotoForVisualAngles(robotId: string, visualAngles: number[]): string {
    const robot = this.requireRobot(robotId);
    validateJointArray(visualAngles);

    const manager = this.jointRuntime.getManager(robotId);
    const orderedJointNames =
      manager.getOrderedJointNames().length > 0
        ? manager.getOrderedJointNames()
        : robot.visual.orderedUrdfJointNames;
    const axisNames = getRobotAxisNames(robot);
    if (axisNames.length === 0) {
      throw new Error(`Robot "${robotId}" has no discovered axes for goto ordering.`);
    }

    const joints = mapVisualAnglesToAxisValues(
      visualAngles,
      orderedJointNames,
      axisNames,
      robot.visual.axisToJointName,
    );
    return this.callRobotGoto(robotId, { joints });
  }

  toggleEndEffector(robotId: string, command: ToggleEndEffectorCommand = {}): string {
    const robot = this.requireRobot(robotId);
    const motionDeviceId = this.requireBoundMotionDeviceId(robotId);
    const method = robot.opcua.methods.toggleEndEffector;
    if (!method) {
      throw new Error(`Robot "${robotId}" has no discovered toggleEndEffector method.`);
    }

    const inputs =
      command.value === undefined ? { args: [] } : { args: [command.value] };
    const requestId = this.client.callRobotMethod(
      motionDeviceId,
      'toggleEndEffector',
      inputs,
    );
    this.trackPendingMethodCall({
      requestId,
      serverUrl: robot.serverUrl,
      motionDeviceId,
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

    if (message.type === 'methodResult' && typeof message.requestId === 'string') {
      this.jointRuntime.clearSyncGotoInFlightByRequestId(message.requestId);
    }

    if (message.type === 'error' && typeof message.requestId === 'string') {
      this.jointRuntime.clearSyncGotoInFlightByRequestId(message.requestId);
    }

    this.serverState = applyServerMessage(this.serverState, message);
    this.robotState = applyRobotMessage(this.robotState, message);

    if (message.type === 'robotJointState') {
      const localRobotId = this.findRobotInstanceIdByMotionDeviceId(message.robotId);
      if (localRobotId) {
        this.jointRuntime.update(localRobotId, message.data);
      }
    }

    this.emitState();
  }

  private removeRuntimeForServer(serverUrl: string): void {
    for (const robot of Object.values(this.robotState.byId)) {
      if (robot.serverUrl === serverUrl) {
        this.jointRuntime.stopSync(robot.robotId);
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

  private requireBoundMotionDeviceId(robotId: string): string {
    const robot = this.requireRobot(robotId);
    if (!robot.motionDeviceId) {
      throw new Error(`Robot "${robotId}" is not bound to a motion device.`);
    }
    return robot.motionDeviceId;
  }

  private findRobotInstanceIdByMotionDeviceId(motionDeviceId: string): string | null {
    for (const robot of Object.values(this.robotState.byId)) {
      if (robot.motionDeviceId === motionDeviceId) {
        return robot.robotId;
      }
    }
    return null;
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

function getRobotAxisNames(robot: Robot): string[] {
  const discoveredAxisNames = Object.keys(robot.opcua.axes);
  if (discoveredAxisNames.length > 0) {
    return discoveredAxisNames;
  }

  const reportedAxisNames = Object.keys(robot.joints.axisValues);
  if (reportedAxisNames.length > 0) {
    return reportedAxisNames;
  }

  return Object.keys(robot.visual.axisToJointName);
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim() === '') {
    throw new Error(`${name} must not be empty.`);
  }
}
