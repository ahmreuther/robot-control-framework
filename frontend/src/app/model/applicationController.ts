import {
  applyRobotMessage,
  initialRobotStoreState,
  type RobotStoreState,
} from "../../entities/robot/model/store";
import {
  createLocalRobot,
  bindRobotToMotionDevice,
  unbindRobotFromMotionDevice,
  createRobotFromSession,
  type Robot,
  type RobotPanelState,
  type RobotSessionInfo,
  type RobotVisualBinding,
} from "../../entities/robot/model/types";
import type {
  RobotModelConfig,
  RobotOrigin,
} from "../../features/robot-control/model/robotModels";
import {
  defaultRobotOrigin,
  resolveRobotModelFromIdentity,
} from "../../features/robot-control/model/robotModels";
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
} from "../../entities/server/model/store";
import {
  WscWebSocketClient,
  type MessageLogListener,
  type StatusListener,
  type WebSocketClientStatus,
} from "../../shared/api/websocketClient";
import type { ServerMessage } from "../../shared/api/messages";
import {
  createRobotJointRuntime,
  type RobotJointRuntime,
  type RobotJointRuntimeStartResult,
} from "../../features/robot-control/model/robotJointRuntime";
import { mapVisualAnglesToAxisValues } from "../../features/robot-control/model/axisMapping";

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

const DEFAULT_GOTO_MODE = "automatic";
const DEFAULT_GOTO_SPEED = -1.0;
const DEFAULT_GOTO_TIME = -1.0;
const TAKE_CONTROL_KEEPALIVE_INTERVAL_MS = 60_000;

interface TakeControlKeepaliveState {
  intervalId: ReturnType<typeof window.setInterval>;
  inFlight: boolean;
}

export class ApplicationController {
  private serverState = initialServerStoreState;
  private robotState = initialRobotStoreState;
  private localRobotCounter = 0;
  private readonly client: WscWebSocketClient;
  private readonly jointRuntime: RobotJointRuntime;
  private readonly listeners = new Set<ApplicationStateListener>();
  private readonly unsubscribeClientMessage: () => void;
  private readonly pendingMethodCallWaiters = new Map<
    string,
    {
      resolve: () => void;
      reject: (error: Error) => void;
    }
  >();
  private readonly takeControlKeepaliveByRobotId = new Map<
    string,
    TakeControlKeepaliveState
  >();

  constructor(options: ApplicationControllerOptions) {
    this.client = options.client;
    this.jointRuntime = options.jointRuntime ?? createRobotJointRuntime();
    this.unsubscribeClientMessage = this.client.onMessage((message) => {
      this.handleServerMessage(message);
    });
  }

  dispose(): void {
    this.stopAllTakeControlKeepalives();
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
    assertNonEmpty("serverUrl", serverUrl);
    const requestId = this.client.browseAddressSpaceRoot(serverUrl);
    this.serverState = requestAddressSpaceRoot(
      this.serverState,
      serverUrl,
      requestId,
    );
    this.emitState();
    return requestId;
  }

  browseAddressSpaceChildren(serverUrl: string, nodeId: string): string {
    assertNonEmpty("serverUrl", serverUrl);
    assertNonEmpty("nodeId", nodeId);
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
    assertNonEmpty("serverUrl", serverUrl);
    assertNonEmpty("nodeId", nodeId);
    const requestId = this.client.browseAddressSpaceReferences(
      serverUrl,
      nodeId,
    );
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
    assertNonEmpty("serverUrl", serverUrl);
    assertNonEmpty("nodeId", nodeId);
    const requestId = this.client.browseAddressSpaceNodeDetails(
      serverUrl,
      nodeId,
    );
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
    assertNonEmpty("serverUrl", serverUrl);
    this.serverState = selectAddressSpaceNode(
      this.serverState,
      serverUrl,
      nodeId,
    );
    this.emitState();
  }

  setAddressSpaceExpandedNodeIds(serverUrl: string, nodeIds: string[]): void {
    assertNonEmpty("serverUrl", serverUrl);
    this.serverState = setExpandedAddressSpaceNodes(
      this.serverState,
      serverUrl,
      nodeIds,
    );
    this.emitState();
  }

  createRobot(
    displayName: string,
    model: RobotModelConfig,
    origin: RobotOrigin,
  ): string {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      throw new Error("Robot name must not be empty.");
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
          roll: origin.roll,
          pitch: origin.pitch,
          yaw: origin.yaw,
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

  bindRobotToMotionDevice(
    robotId: string,
    motionDeviceId: string | null,
  ): void {
    const robot = this.requireRobot(robotId);
    if (robot.motionDeviceId !== motionDeviceId) {
      this.jointRuntime.stopSync(robotId);
      this.stopTakeControlKeepalive(robotId);
    }
    const nextRobot =
      motionDeviceId === null
        ? unbindRobotFromMotionDevice(robot)
        : (() => {
            const motionDevice =
              this.serverState.motionDevicesById[motionDeviceId];
            if (!motionDevice) {
              throw new Error(
                `Motion device "${motionDeviceId}" is not known.`,
              );
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

    this.stopTakeControlKeepalive(robotId);
    const nextById = { ...this.robotState.byId };
    delete nextById[robotId];
    this.jointRuntime.removeRobot(robotId);

    const remainingRobotIds = Object.keys(nextById);
    this.robotState = {
      ...this.robotState,
      byId: nextById,
      activeRobotId:
        this.robotState.activeRobotId === robotId
          ? (remainingRobotIds[0] ?? null)
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
    return motionDeviceId
      ? this.client.unsubscribeRobotJoints(motionDeviceId)
      : "";
  }

  async setRobotTakeControl(
    robotId: string,
    enabled: boolean,
  ): Promise<string[]> {
    const robot = this.requireRobot(robotId);
    this.requireBoundMotionDeviceId(robotId);

    const requestIds: string[] = [];

    if (enabled) {
      const createSessionRequestId = this.executeRobotAction(
        robotId,
        "createSession",
        buildDefaultActionInputs(robot, "createSession"),
      );
      requestIds.push(createSessionRequestId);
      await this.waitForMethodCall(createSessionRequestId);
      if (robot.actions?.initLock) {
        const initLockRequestId = this.executeRobotAction(
          robotId,
          "initLock",
          buildDefaultActionInputs(robot, "initLock"),
        );
        requestIds.push(initLockRequestId);
        await this.waitForMethodCall(initLockRequestId);
      }
      this.startTakeControlKeepalive(robotId);
    } else {
      this.stopTakeControlKeepalive(robotId);
      if (robot.actions?.exitLock) {
        const exitLockRequestId = this.executeRobotAction(
          robotId,
          "exitLock",
          buildDefaultActionInputs(robot, "exitLock"),
        );
        requestIds.push(exitLockRequestId);
        await this.waitForMethodCall(exitLockRequestId);
      }
      const invalidateSessionRequestId = this.executeRobotAction(
        robotId,
        "invalidateSession",
        buildDefaultActionInputs(robot, "invalidateSession"),
      );
      requestIds.push(invalidateSessionRequestId);
      await this.waitForMethodCall(invalidateSessionRequestId);
    }

    this.updateRobotPanelState(robotId, { takeControlActive: enabled });
    return requestIds;
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
    return this.client.subscribeRobotMode(
      this.requireBoundMotionDeviceId(robotId),
    );
  }

  unsubscribeRobotMode(robotId: string): string {
    return this.client.unsubscribeRobotMode(
      this.requireBoundMotionDeviceId(robotId),
    );
  }

  subscribeNode(serverUrl: string, nodeId: string): string {
    assertNonEmpty("serverUrl", serverUrl);
    assertNonEmpty("nodeId", nodeId);
    this.serverState = markNodeSubscription(
      this.serverState,
      serverUrl,
      nodeId,
    );
    this.emitState();
    return this.client.subscribeNode(serverUrl, nodeId);
  }

  unsubscribeNode(serverUrl: string, nodeId: string): string {
    assertNonEmpty("serverUrl", serverUrl);
    assertNonEmpty("nodeId", nodeId);
    this.serverState = unmarkNodeSubscription(
      this.serverState,
      serverUrl,
      nodeId,
    );
    this.emitState();
    return this.client.unsubscribeNode(serverUrl, nodeId);
  }

  subscribeEvent(serverUrl: string, nodeId: string): string {
    assertNonEmpty("serverUrl", serverUrl);
    assertNonEmpty("nodeId", nodeId);
    this.serverState = markEventSubscription(
      this.serverState,
      serverUrl,
      nodeId,
    );
    this.emitState();
    return this.client.subscribeEvent(serverUrl, nodeId);
  }

  unsubscribeEvent(serverUrl: string, nodeId: string): string {
    assertNonEmpty("serverUrl", serverUrl);
    assertNonEmpty("nodeId", nodeId);
    this.serverState = unmarkEventSubscription(
      this.serverState,
      serverUrl,
      nodeId,
    );
    this.emitState();
    return this.client.unsubscribeEvent(serverUrl, nodeId);
  }

  callRobotGoto(robotId: string, command: RobotGotoCommand): string {
    const robot = this.requireRobot(robotId);
    validateJointArray(command.joints);
    if (!isGotoReadyForDispatch(robot)) {
      throw new Error(
        `Robot "${robot.robotId}" goto skill is still active. Wait until it returns to Ready/Idle before sending the next goto.`,
      );
    }
    if (robot.actions?.goto || robot.opcua.skills?.go_to) {
      return this.executeRobotAction(
        robotId,
        "goto",
        buildGotoActionInputs(robot, command),
      );
    }
    throw new Error(
      `Robot "${robot.robotId}" has no discovered goto action or go_to skill.`,
    );
  }

  callRobotGotoForVisualAngles(
    robotId: string,
    visualAngles: number[],
  ): string {
    const robot = this.requireRobot(robotId);
    validateJointArray(visualAngles);

    const manager = this.jointRuntime.getManager(robotId);
    const orderedJointNames =
      manager.getOrderedJointNames().length > 0
        ? manager.getOrderedJointNames()
        : robot.visual.orderedUrdfJointNames;
    const axisNames = getRobotAxisNames(robot);
    if (axisNames.length === 0) {
      throw new Error(
        `Robot "${robotId}" has no discovered axes for goto ordering.`,
      );
    }

    const joints = mapVisualAnglesToAxisValues(
      visualAngles,
      orderedJointNames,
      axisNames,
      robot.visual.axisToJointName,
    );
    return this.callRobotGoto(robotId, { joints });
  }

  toggleEndEffector(
    robotId: string,
    command: ToggleEndEffectorCommand = {},
  ): string {
    const robot = this.requireRobot(robotId);
    const motionDeviceId = this.requireBoundMotionDeviceId(robotId);
    const method = robot.opcua.methods.toggleEndEffector;
    if (!method) {
      throw new Error(
        `Robot "${robotId}" has no discovered toggleEndEffector method.`,
      );
    }

    const inputs =
      command.value === undefined ? { args: [] } : { args: [command.value] };
    const requestId = this.client.callRobotMethod(
      motionDeviceId,
      "toggleEndEffector",
      inputs,
    );
    this.trackPendingMethodCall({
      requestId,
      serverUrl: robot.serverUrl,
      motionDeviceId,
      method: "toggleEndEffector",
      nodeId: method.nodeId,
    });
    return requestId;
  }

  executeRobotAction(
    robotId: string,
    actionName: string,
    inputs: Record<string, unknown> = {},
  ): string {
    const robot = this.requireRobot(robotId);
    const motionDeviceId = this.requireBoundMotionDeviceId(robotId);
    const action = robot.actions?.[actionName];
    const requestId = this.client.executeRobotAction(
      motionDeviceId,
      actionName,
      inputs,
    );
    this.trackPendingMethodCall({
      requestId,
      serverUrl: robot.serverUrl,
      motionDeviceId,
      method: `action:${actionName}`,
      nodeId: action?.skillNodeId ?? action?.methodNodeId ?? undefined,
    });
    return requestId;
  }

  haltRobotAction(robotId: string, actionName: string): string {
    const robot = this.requireRobot(robotId);
    const motionDeviceId = this.requireBoundMotionDeviceId(robotId);
    const action = robot.actions?.[actionName];
    const requestId = this.client.haltRobotAction(motionDeviceId, actionName);
    this.trackPendingMethodCall({
      requestId,
      serverUrl: robot.serverUrl,
      motionDeviceId,
      method: `halt:${actionName}`,
      nodeId: action?.haltNodeId ?? action?.skillNodeId ?? undefined,
    });
    return requestId;
  }

  resetRobotAction(robotId: string, actionName: string): string {
    const robot = this.requireRobot(robotId);
    const motionDeviceId = this.requireBoundMotionDeviceId(robotId);
    const action = robot.actions?.[actionName];
    const requestId = this.client.resetRobotAction(motionDeviceId, actionName);
    this.trackPendingMethodCall({
      requestId,
      serverUrl: robot.serverUrl,
      motionDeviceId,
      method: `reset:${actionName}`,
      nodeId: action?.resetNodeId ?? action?.skillNodeId ?? undefined,
    });
    return requestId;
  }

  callRawMethod(command: RawMethodCommand): string {
    assertNonEmpty("serverUrl", command.serverUrl);
    assertNonEmpty("nodeId", command.nodeId);
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
      method: "raw",
    });
    return requestId;
  }

  private handleServerMessage(message: ServerMessage): void {
    if (message.type === "serverDisconnected") {
      this.removeRuntimeForServer(message.serverUrl);
    }

    if (message.type === "error" && typeof message.requestId === "string") {
      this.jointRuntime.clearSyncGotoInFlightByRequestId(message.requestId);
    }

    if (message.type === "robotJointState") {
      const localRobotId = this.findRobotInstanceIdByMotionDeviceId(
        message.robotId,
      );
      if (localRobotId) {
        this.jointRuntime.update(localRobotId, message.data);
        if (this.jointRuntime.isSyncing(localRobotId)) {
          return;
        }
      }
    }

    if (message.type === "robotsDiscovered") {
      this.robotState = this.rebuildRobotsFromDiscoveredSessions(
        message.serverUrl,
        message.robots,
      );
      for (const session of message.robots) {
        const robot = this.robotState.byId[session.robotId];
        if (robot) {
          this.jointRuntime.configureRobot(robot);
        }
      }
    }

    this.serverState = applyServerMessage(this.serverState, message);
    if (message.type !== "robotsDiscovered") {
      this.robotState = applyRobotMessage(this.robotState, message);
    }

    if (
      "requestId" in message &&
      typeof message.requestId === "string" &&
      this.serverState.methodCallStatuses[message.requestId]
    ) {
      this.resolvePendingMethodCallWaiter(message.requestId);
    }

    if (
      message.type === "robotActionState" &&
      message.data.actionName === "goto"
    ) {
      const localRobotId = this.findRobotInstanceIdByMotionDeviceId(
        message.robotId,
      );
      if (localRobotId && isGotoStateReady(message.data)) {
        this.jointRuntime.clearSyncGotoInFlight(localRobotId);
      }
    }

    this.emitState();
  }

  private removeRuntimeForServer(serverUrl: string): void {
    for (const robot of Object.values(this.robotState.byId)) {
      if (robot.serverUrl === serverUrl) {
        this.jointRuntime.stopSync(robot.robotId);
        this.stopTakeControlKeepalive(robot.robotId);
      }
    }
  }

  private startTakeControlKeepalive(robotId: string): void {
    this.stopTakeControlKeepalive(robotId);
    const robot = this.requireRobot(robotId);
    const hasRenewSession = !!robot.actions?.renewSession;
    const hasRenewLock = !!robot.actions?.renewLock;
    if (!hasRenewSession && !hasRenewLock) {
      return;
    }

    const keepalive: TakeControlKeepaliveState = {
      intervalId: window.setInterval(() => {
        void this.runTakeControlKeepalive(robotId);
      }, TAKE_CONTROL_KEEPALIVE_INTERVAL_MS),
      inFlight: false,
    };
    this.takeControlKeepaliveByRobotId.set(robotId, keepalive);
  }

  private stopTakeControlKeepalive(robotId: string): void {
    const keepalive = this.takeControlKeepaliveByRobotId.get(robotId);
    if (!keepalive) {
      return;
    }
    window.clearInterval(keepalive.intervalId);
    this.takeControlKeepaliveByRobotId.delete(robotId);
  }

  private stopAllTakeControlKeepalives(): void {
    for (const robotId of this.takeControlKeepaliveByRobotId.keys()) {
      this.stopTakeControlKeepalive(robotId);
    }
  }

  private async runTakeControlKeepalive(robotId: string): Promise<void> {
    const keepalive = this.takeControlKeepaliveByRobotId.get(robotId);
    if (!keepalive || keepalive.inFlight) {
      return;
    }

    keepalive.inFlight = true;
    try {
      const robot = this.requireRobot(robotId);
      if (!robot.panel.takeControlActive || !robot.motionDeviceId) {
        this.stopTakeControlKeepalive(robotId);
        return;
      }

      if (robot.actions?.renewSession) {
        const renewSessionRequestId = this.executeRobotAction(
          robotId,
          "renewSession",
          buildDefaultActionInputs(robot, "renewSession"),
        );
        await this.waitForMethodCall(renewSessionRequestId);
      }

      const latestRobot = this.requireRobot(robotId);
      if (latestRobot.actions?.renewLock) {
        const renewLockRequestId = this.executeRobotAction(
          robotId,
          "renewLock",
          buildDefaultActionInputs(latestRobot, "renewLock"),
        );
        await this.waitForMethodCall(renewLockRequestId);
      }
    } catch (error) {
      console.error(`Failed to keep take-control lease alive for ${robotId}`, error);
      this.stopTakeControlKeepalive(robotId);
      if (this.robotState.byId[robotId]) {
        this.updateRobotPanelState(robotId, { takeControlActive: false });
      }
    } finally {
      const latestKeepalive = this.takeControlKeepaliveByRobotId.get(robotId);
      if (latestKeepalive) {
        latestKeepalive.inFlight = false;
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

  private findRobotInstanceIdByMotionDeviceId(
    motionDeviceId: string,
  ): string | null {
    for (const robot of Object.values(this.robotState.byId)) {
      if (robot.motionDeviceId === motionDeviceId) {
        return robot.robotId;
      }
    }
    return null;
  }

  private rebuildRobotsFromDiscoveredSessions(
    serverUrl: string,
    sessions: RobotSessionInfo[],
  ): RobotStoreState {
    const nextById: RobotStoreState["byId"] = Object.fromEntries(
      Object.entries(this.robotState.byId).filter(
        ([, robot]) => robot.serverUrl !== serverUrl,
      ),
    );

    for (const session of sessions) {
      const existing = this.robotState.byId[session.robotId];
      const model = resolveRobotModelFromIdentity({
        displayName: session.displayName,
        model: session.info.model,
        manufacturer: session.info.manufacturer,
        browseName: session.motionDevice.browseName,
      });

      const baseRobot = createRobotFromSession(session);
      const nextRobot: Robot = {
        ...baseRobot,
        joints: existing?.joints ?? baseRobot.joints,
        actionStates: existing?.actionStates ?? baseRobot.actionStates,
        mode: existing?.mode ?? baseRobot.mode,
        homeAngles: model?.homeAngles ?? existing?.homeAngles ?? null,
        status: model ? session.status : "error",
        visual: {
          ...baseRobot.visual,
          urdfId: model?.id ?? null,
          urdfLabel: model?.label ?? null,
          urdfUrl: model?.url ?? null,
          origin:
            existing?.visual.origin ??
            defaultRobotOrigin(model?.id ?? null),
          orderedUrdfJointNames: model?.orderedUrdfJointNames ?? [],
          allUrdfJointNames:
            existing?.visual.allUrdfJointNames &&
            existing.visual.allUrdfJointNames.length > 0
              ? existing.visual.allUrdfJointNames
              : (model?.orderedUrdfJointNames ?? []),
          axisToJointName: existing?.visual.axisToJointName ?? {},
        },
        panel: existing?.panel ?? baseRobot.panel,
      };
      nextById[session.robotId] = nextRobot;
    }

    const nextActiveRobotId =
      (this.robotState.activeRobotId && nextById[this.robotState.activeRobotId]
        ? this.robotState.activeRobotId
        : null) ??
      Object.keys(nextById)[0] ??
      null;

    return {
      byId: nextById,
      activeRobotId: nextActiveRobotId,
    };
  }

  private trackPendingMethodCall(
    request: Parameters<typeof trackMethodCallRequest>[1],
  ): void {
    this.serverState = trackMethodCallRequest(this.serverState, request);
    this.emitState();
  }

  private waitForMethodCall(requestId: string): Promise<void> {
    const existingStatus = this.serverState.methodCallStatuses[requestId];
    if (existingStatus?.status === "succeeded") {
      return Promise.resolve();
    }
    if (existingStatus?.status === "failed") {
      return Promise.reject(
        new Error(
          existingStatus.error?.message ?? `Request "${requestId}" failed.`,
        ),
      );
    }

    return new Promise<void>((resolve, reject) => {
      this.pendingMethodCallWaiters.set(requestId, { resolve, reject });
    });
  }

  private resolvePendingMethodCallWaiter(requestId: string): void {
    const waiter = this.pendingMethodCallWaiters.get(requestId);
    if (!waiter) {
      return;
    }

    const status = this.serverState.methodCallStatuses[requestId];
    if (!status || status.status === "pending") {
      return;
    }

    this.pendingMethodCallWaiters.delete(requestId);
    if (status.status === "succeeded") {
      waiter.resolve();
      return;
    }

    waiter.reject(
      new Error(status.error?.message ?? `Request "${requestId}" failed.`),
    );
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

function buildGotoActionInputs(
  robot: Robot,
  command: RobotGotoCommand,
): Record<string, unknown> {
  const allowedParameterNames = new Set(
    robot.actions?.goto?.parameterNames.length
      ? robot.actions.goto.parameterNames
      : Object.keys(robot.opcua.skills?.go_to?.parameters ?? {}),
  );
  const inputs: Record<string, unknown> = {
    mode: command.mode ?? DEFAULT_GOTO_MODE,
    joints: command.joints.map((value) => Number(value)),
  };

  const hasTime = command.time !== undefined;
  const hasMaxSpeed = command.maxSpeed !== undefined;
  inputs.max_speed = hasTime
    ? DEFAULT_GOTO_SPEED
    : Number(command.maxSpeed ?? DEFAULT_GOTO_SPEED);
  inputs.time = hasMaxSpeed
    ? DEFAULT_GOTO_TIME
    : Number(command.time ?? DEFAULT_GOTO_TIME);
  inputs.tcp_config = serializeGotoOptionalString(command.tcpConfig);
  inputs.avoidance_zones = serializeGotoOptionalString(command.avoidanceZones);

  if (allowedParameterNames.size === 0) {
    return inputs;
  }

  return Object.fromEntries(
    Object.entries(inputs).filter(([name]) => allowedParameterNames.has(name)),
  );
}

function buildDefaultActionInputs(
  robot: Robot,
  actionName: string,
): Record<string, unknown> {
  const parameterNames = robot.actions?.[actionName]?.parameterNames ?? [];
  return Object.fromEntries(parameterNames.map((name) => [name, null]));
}

function serializeGotoOptionalString(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function isGotoReadyForDispatch(robot: Robot): boolean {
  return isGotoStateReady(robot.actionStates.goto);
}

function isGotoStateReady(
  state:
    | { status?: string | null; currentState?: string | null }
    | null
    | undefined,
): boolean {
  if (!state) {
    return true;
  }
  const currentState = (state.currentState ?? "").trim().toLowerCase();
  if (currentState === "ready" || currentState === "idle") {
    return true;
  }
  return state.status !== "running";
}

function validateJointArray(joints: number[]): void {
  if (!Array.isArray(joints) || joints.length === 0) {
    throw new Error("Goto command requires at least one joint value.");
  }

  for (const value of joints) {
    if (!Number.isFinite(value)) {
      throw new Error("Goto joint values must be finite numbers.");
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
  if (value.trim() === "") {
    throw new Error(`${name} must not be empty.`);
  }
}
