import type {
  AxisBinding,
  MethodBinding,
  MotionDeviceBinding,
  SkillBinding,
} from '../../server/model/types';

export type RobotConnectionStatus = 'unknown' | 'connected' | 'disconnected' | 'error';

export interface RobotInfo {
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
}

export interface RobotOpcUaInterface {
  variables: Record<string, string>;
  methods: Record<string, MethodBinding>;
  skills?: Record<string, SkillBinding>;
  axes: Record<string, AxisBinding>;
}

export interface RobotActionBinding {
  kind: 'method' | 'skill';
  targetName: string;
  displayName?: string | null;
  methodNodeId?: string | null;
  skillNodeId?: string | null;
  parameterSetNodeId?: string | null;
  resultSetNodeId?: string | null;
  currentStateNodeId?: string | null;
  startNodeId?: string | null;
  haltNodeId?: string | null;
  resetNodeId?: string | null;
  suspendNodeId?: string | null;
  resumeNodeId?: string | null;
  parameterNames: string[];
  resultNames: string[];
}

export interface RobotActionState {
  actionName: string;
  kind: 'method' | 'skill';
  status: 'idle' | 'running' | 'succeeded' | 'failed' | 'halted' | 'reset';
  currentState?: string | null;
  message?: string | null;
}

export interface RobotJointState {
  axisValues: Record<string, number>;
  unit?: string | Record<string, unknown> | null;
}

export interface RobotSessionInfo {
  robotId: string;
  serverUrl: string;
  displayName: string;
  motionDevice: MotionDeviceBinding;
  info: RobotInfo;
  opcua: RobotOpcUaInterface;
  actions?: Record<string, RobotActionBinding>;
  status: RobotConnectionStatus;
}

export interface RobotVisualBinding {
  urdfId?: string | null;
  urdfLabel?: string | null;
  urdfUrl?: string | null;
  origin: {
    x: number;
    y: number;
    z: number;
    roll: number;
    pitch: number;
    yaw: number;
  };
  // Articulated joint order used for axis mapping and solver-facing arm logic.
  orderedUrdfJointNames: string[];
  // Full movable URDF joint order used by the joint manager, home pose, and startup animation.
  allUrdfJointNames?: string[];
  axisToJointName: Record<string, string>;
}

export interface RobotPanelState {
  useDegrees: boolean;
  showCollisionMap: boolean;
  showWorkspace: boolean;
  workspaceSampleCount: number;
  workspaceGeneratedSampleCount: number | null;
  workspaceGenerationPending: boolean;
  workspaceProgressPercent: number | null;
  workspaceProgressLabel: string | null;
  workspaceGenerationVersion: number;
  workspaceAbortVersion: number;
  goalMarkerEnabled: boolean;
  goalMarkerConstraintMode: 'pose' | 'position';
  goalMarkerMode: 'translate' | 'rotate';
  goalMarkerSpace: 'local' | 'world';
}

export interface Robot extends RobotSessionInfo {
  motionDeviceId: string | null;
  joints: RobotJointState;
  actionStates: Record<string, RobotActionState>;
  mode: string | null;
  visual: RobotVisualBinding;
  panel: RobotPanelState;
  homeAngles: number[] | null;
}

export function createRobotFromSession(session: RobotSessionInfo): Robot {
  return {
    ...session,
    motionDeviceId: session.robotId,
    joints: {
      axisValues: {},
      unit: null,
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
        roll: 0,
        pitch: 0,
        yaw: 0,
      },
      orderedUrdfJointNames: [],
      allUrdfJointNames: [],
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
  };
}

export function createLocalRobot(
  robotId: string,
  displayName: string,
): Robot {
  return {
    ...createRobotFromSession({
      robotId,
      serverUrl: 'local://manual',
      displayName,
      motionDevice: {
        nodeId: `manual:${robotId}`,
        displayName,
        browseName: displayName,
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
    }),
    motionDeviceId: null,
  };
}

export function bindRobotToMotionDevice(
  robot: Robot,
  motionDevice: RobotSessionInfo,
): Robot {
  return {
    ...robot,
    serverUrl: motionDevice.serverUrl,
    motionDeviceId: motionDevice.robotId,
    motionDevice: motionDevice.motionDevice,
    info: motionDevice.info,
    opcua: motionDevice.opcua,
    actions: motionDevice.actions,
    status: motionDevice.status,
  };
}

export function unbindRobotFromMotionDevice(robot: Robot): Robot {
  return {
    ...robot,
    serverUrl: 'local://manual',
    motionDeviceId: null,
    motionDevice: {
      nodeId: `manual:${robot.robotId}`,
      displayName: robot.displayName,
      browseName: robot.displayName,
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
    mode: null,
    actionStates: {},
  };
}
