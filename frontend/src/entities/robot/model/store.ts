import type { ServerMessage } from '../../../shared/api/messages';
import type { Robot } from './types';
import { bindRobotToMotionDevice, unbindRobotFromMotionDevice } from './types';

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
    case 'robotsDiscovered': {
      let changed = false;
      const nextById = { ...state.byId };
      const discoveredByMotionDeviceId = Object.fromEntries(
        message.robots.map((robot) => [robot.robotId, robot]),
      );

      for (const [localRobotId, robot] of Object.entries(state.byId)) {
        if (!robot.motionDeviceId) {
          continue;
        }
        const discovered = discoveredByMotionDeviceId[robot.motionDeviceId];
        if (!discovered) {
          continue;
        }
        nextById[localRobotId] = bindRobotToMotionDevice(robot, discovered);
        changed = true;
      }

      return changed
        ? {
            ...state,
            byId: nextById,
          }
        : state;
    }

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

    case 'robotActionState': {
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
            actionStates: {
              ...current.actionStates,
              [message.data.actionName]: message.data,
            },
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
      const nextById = Object.fromEntries(
        Object.entries(state.byId).filter(
          ([, robot]) => robot.serverUrl !== message.serverUrl,
        ),
      );

      return {
        byId: nextById,
        activeRobotId:
          state.activeRobotId && nextById[state.activeRobotId]
            ? state.activeRobotId
            : Object.keys(nextById)[0] ?? null,
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
