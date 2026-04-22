import type { ServerMessage } from '../../../shared/api/messages';
import type { Robot } from './types';
import { createRobotFromSession } from './types';

export interface RobotStoreState {
  byId: Record<string, Robot>;
  activeRobotId: string | null;
}

export const initialRobotStoreState: RobotStoreState = {
  byId: {},
  activeRobotId: null,
};

export function applyRobotMessage(
  state: RobotStoreState,
  message: ServerMessage,
): RobotStoreState {
  switch (message.type) {
    case 'robotsDiscovered': {
      const nextById = { ...state.byId };
      for (const session of message.robots) {
        nextById[session.robotId] = {
          ...(nextById[session.robotId] ?? createRobotFromSession(session)),
          ...session,
        };
      }

      return {
        byId: nextById,
        activeRobotId: state.activeRobotId ?? message.robots[0]?.robotId ?? null,
      };
    }

    case 'robotInfo': {
      const current = state.byId[message.robotId] ?? createRobotFromSession(message.robot);
      return {
        ...state,
        byId: {
          ...state.byId,
          [message.robotId]: {
            ...current,
            ...message.robot,
          },
        },
      };
    }

    case 'robotJointState': {
      const current = state.byId[message.robotId];
      if (!current) return state;

      return {
        ...state,
        byId: {
          ...state.byId,
          [message.robotId]: {
            ...current,
            joints: message.data,
          },
        },
      };
    }

    case 'robotModeChanged': {
      const current = state.byId[message.robotId];
      if (!current) return state;

      return {
        ...state,
        byId: {
          ...state.byId,
          [message.robotId]: {
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
          ...robot,
          status: 'disconnected',
        };
      }

      const activeRobot = state.activeRobotId ? nextById[state.activeRobotId] : null;
      return {
        byId: nextById,
        activeRobotId:
          activeRobot?.serverUrl === message.serverUrl ? null : state.activeRobotId,
      };
    }

    case 'error': {
      if (!message.robotId) return state;
      const current = state.byId[message.robotId];
      if (!current) return state;

      return {
        ...state,
        byId: {
          ...state.byId,
          [message.robotId]: {
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
