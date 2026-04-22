import type { AxisBinding, MethodBinding, MotionDeviceBinding } from '../../opcua/model/types';

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
  orderedUrdfJointNames: string[];
  axisToJointName: Record<string, string>;
}

export interface Robot extends RobotSessionInfo {
  joints: RobotJointState;
  mode: string | null;
  visual: RobotVisualBinding;
}

export function createRobotFromSession(session: RobotSessionInfo): Robot {
  return {
    ...session,
    joints: {
      axisValues: {},
      unit: null,
    },
    mode: null,
    visual: {
      urdfId: null,
      urdfLabel: null,
      urdfUrl: null,
      orderedUrdfJointNames: [],
      axisToJointName: {},
    },
  };
}
