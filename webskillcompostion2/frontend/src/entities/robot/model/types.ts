import type { AxisBinding, MethodBinding, MotionDeviceBinding } from '../../server/model/types';

export type RobotConnectionStatus = 'unknown' | 'connected' | 'disconnected' | 'error';

export interface RobotInfo {
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
}

export interface RobotOpcUaInterface {
  variables: Record<string, string>;
  methods: Record<string, MethodBinding>;
  axes: Record<string, AxisBinding>;
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
  };
  orderedUrdfJointNames: string[];
  axisToJointName: Record<string, string>;
}

export interface RobotPanelState {
  useDegrees: boolean;
  showCollisionMap: boolean;
  showWorkspace: boolean;
}

export interface Robot extends RobotSessionInfo {
  motionDeviceId: string | null;
  joints: RobotJointState;
  mode: string | null;
  visual: RobotVisualBinding;
  panel: RobotPanelState;
}

export function createRobotFromSession(session: RobotSessionInfo): Robot {
  return {
    ...session,
    motionDeviceId: session.robotId,
    joints: {
      axisValues: {},
      unit: null,
    },
    mode: null,
    visual: {
      urdfId: null,
      urdfLabel: null,
      urdfUrl: null,
      origin: {
        x: 0,
        y: 0,
        z: 0,
      },
      orderedUrdfJointNames: [],
      axisToJointName: {},
    },
    panel: {
      useDegrees: false,
      showCollisionMap: false,
      showWorkspace: false,
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
        axes: {},
      },
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
      axes: {},
    },
    status: 'unknown',
    mode: null,
  };
}
