import type { ServerMessage } from '../../../shared/api/messages';
import type { Robot } from './types';
import {
  bindRobotToMotionDevice,
  createRobotFromSession,
  unbindRobotFromMotionDevice,
} from './types';

export interface RobotStoreState {
  byId: Record<string, Robot>;
  activeRobotId: string | null;
}

export const initialRobotStoreState: RobotStoreState = {
  byId: {},
  activeRobotId: null,
};

function findRobotInstanceIdByMotionDeviceId(
  state: RobotStoreState,
  motionDeviceId: string,
): string | null {
  for (const robot of Object.values(state.byId)) {
    if (robot.motionDeviceId === motionDeviceId) {
      return robot.robotId;
    }
  }
  return null;
}

export function applyRobotMessage(
  state: RobotStoreState,
  message: ServerMessage,
): RobotStoreState {
  switch (message.type) {
    case 'robotsDiscovered':
      return state;

    case 'robotInfo': {
      const localRobotId = findRobotInstanceIdByMotionDeviceId(state, message.robotId);
      if (!localRobotId) return state;
      const current = state.byId[localRobotId];
      if (!current) return state;
      return {
        ...state,
        byId: {
          ...state.byId,
          [localRobotId]: bindRobotToMotionDevice(current, message.robot),
        },
      };
    }

    case 'robotJointState': {
      const localRobotId = findRobotInstanceIdByMotionDeviceId(state, message.robotId);
      if (!localRobotId) return state;
      const current = state.byId[localRobotId];
      if (!current) return state;

      return {
        ...state,
        byId: {
          ...state.byId,
          [localRobotId]: {
            ...current,
            joints: message.data,
          },
        },
      };
    }

    case 'robotModeChanged': {
      const localRobotId = findRobotInstanceIdByMotionDeviceId(state, message.robotId);
      if (!localRobotId) return state;
      const current = state.byId[localRobotId];
      if (!current) return state;

      return {
        ...state,
        byId: {
          ...state.byId,
          [localRobotId]: {
            ...current,
            mode: message.mode,
          },
        },
      };
    }

    case 'serverDisconnected': {
      const nextById = { ...state.byId };
      for (const [robotId, robot] of Object.entries(nextById)) {
        if (robot.serverUrl !== message.serverUrl) continue;
        nextById[robotId] = {
          ...unbindRobotFromMotionDevice(robot),
          status: 'disconnected',
        };
      }

      return {
        byId: nextById,
        activeRobotId: state.activeRobotId,
      };
    }

    case 'error': {
      if (!message.robotId) return state;
      const localRobotId = findRobotInstanceIdByMotionDeviceId(state, message.robotId);
      if (!localRobotId) return state;
      const current = state.byId[localRobotId];
      if (!current) return state;

      return {
        ...state,
        byId: {
          ...state.byId,
          [localRobotId]: {
            ...current,
            status: 'error',
          },
        },
      };
    }

    default:
      return state;
  }
}
