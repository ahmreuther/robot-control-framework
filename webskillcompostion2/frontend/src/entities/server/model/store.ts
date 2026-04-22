import type { ServerMessage } from '../../../shared/api/messages';
import type { ServerSessionInfo } from './types';

export interface ServerErrorRecord {
  requestId?: string | null;
  serverUrl?: string | null;
  robotId?: string | null;
  message: string;
  code?: string | null;
}

export interface MethodResultRecord {
  requestId?: string | null;
  serverUrl: string;
  robotId?: string | null;
  nodeId?: string | null;
  result: unknown;
}

export type MethodCallStatus = 'pending' | 'succeeded' | 'failed';

export interface MethodCallStatusRecord {
  requestId: string;
  status: MethodCallStatus;
  serverUrl?: string | null;
  robotId?: string | null;
  nodeId?: string | null;
  method?: string | null;
  result?: unknown;
  error?: ServerErrorRecord;
}

export interface NodeValueRecord {
  serverUrl: string;
  nodeId: string;
  value: unknown;
  robotId?: string | null;
}

export interface OpcUaEventRecord {
  serverUrl: string;
  nodeId: string;
  event: unknown;
}

export interface ServerStoreState {
  byUrl: Record<string, ServerSessionInfo>;
  activeServerUrl: string | null;
  errors: ServerErrorRecord[];
  methodResults: MethodResultRecord[];
  methodCallStatuses: Record<string, MethodCallStatusRecord>;
  nodeValues: Record<string, NodeValueRecord>;
  opcuaEvents: OpcUaEventRecord[];
}

export const initialServerStoreState: ServerStoreState = {
  byUrl: {},
  activeServerUrl: null,
  errors: [],
  methodResults: [],
  methodCallStatuses: {},
  nodeValues: {},
  opcuaEvents: [],
};

function disconnectedServer(serverUrl: string, current?: ServerSessionInfo): ServerSessionInfo {
  return {
    serverUrl,
    status: 'disconnected',
    namespaceUris: current?.namespaceUris ?? [],
    isRoboticsServer: current?.isRoboticsServer ?? false,
    robotIds: current?.robotIds ?? [],
  };
}

function nodeValueKey(serverUrl: string, nodeId: string): string {
  return `${serverUrl}::${nodeId}`;
}

export function trackMethodCallRequest(
  state: ServerStoreState,
  request: Omit<MethodCallStatusRecord, 'status'>,
): ServerStoreState {
  return {
    ...state,
    methodCallStatuses: {
      ...state.methodCallStatuses,
      [request.requestId]: {
        ...request,
        status: 'pending',
      },
    },
  };
}

export function applyServerMessage(
  state: ServerStoreState,
  message: ServerMessage,
): ServerStoreState {
  switch (message.type) {
    case 'serverConnected':
      return {
        ...state,
        byUrl: {
          ...state.byUrl,
          [message.server.serverUrl]: message.server,
        },
        activeServerUrl: message.server.serverUrl,
      };

    case 'robotsDiscovered': {
      const current = state.byUrl[message.serverUrl];
      const server: ServerSessionInfo = {
        serverUrl: message.serverUrl,
        status: current?.status ?? 'connected',
        namespaceUris: current?.namespaceUris ?? [],
        isRoboticsServer: current?.isRoboticsServer ?? true,
        robotIds: message.robots.map((robot) => robot.robotId),
      };

      return {
        ...state,
        byUrl: {
          ...state.byUrl,
          [message.serverUrl]: server,
        },
        activeServerUrl: state.activeServerUrl ?? message.serverUrl,
      };
    }

    case 'serverDisconnected':
      return {
        ...state,
        byUrl: {
          ...state.byUrl,
          [message.serverUrl]: disconnectedServer(message.serverUrl, state.byUrl[message.serverUrl]),
        },
        activeServerUrl:
          state.activeServerUrl === message.serverUrl ? null : state.activeServerUrl,
      };

    case 'methodResult':
      return {
        ...state,
        methodResults: [
          ...state.methodResults,
          {
            requestId: message.requestId,
            serverUrl: message.serverUrl,
            robotId: message.robotId,
            nodeId: message.nodeId,
            result: message.result,
          },
        ],
        methodCallStatuses: message.requestId
          ? {
              ...state.methodCallStatuses,
              [message.requestId]: {
                ...(state.methodCallStatuses[message.requestId] ?? {
                  requestId: message.requestId,
                  serverUrl: message.serverUrl,
                  robotId: message.robotId,
                  nodeId: message.nodeId,
                }),
                status: 'succeeded',
                serverUrl: message.serverUrl,
                robotId: message.robotId,
                nodeId: message.nodeId,
                result: message.result,
              },
            }
          : state.methodCallStatuses,
      };

    case 'error':
      return {
        ...state,
        errors: [
          ...state.errors,
          {
            requestId: message.requestId,
            serverUrl: message.serverUrl,
            robotId: message.robotId,
            message: message.message,
            code: message.code,
          },
        ],
        methodCallStatuses:
          message.requestId && state.methodCallStatuses[message.requestId]
            ? {
                ...state.methodCallStatuses,
                [message.requestId]: {
                  ...state.methodCallStatuses[message.requestId],
                  status: 'failed',
                  error: {
                    requestId: message.requestId,
                    serverUrl: message.serverUrl,
                    robotId: message.robotId,
                    message: message.message,
                    code: message.code,
                  },
                },
              }
            : state.methodCallStatuses,
      };

    case 'nodeValueChanged':
      return {
        ...state,
        nodeValues: {
          ...state.nodeValues,
          [nodeValueKey(message.serverUrl, message.nodeId)]: {
            serverUrl: message.serverUrl,
            nodeId: message.nodeId,
            value: message.value,
            robotId: message.robotId,
          },
        },
      };

    case 'opcuaEvent':
      return {
        ...state,
        opcuaEvents: [
          ...state.opcuaEvents,
          {
            serverUrl: message.serverUrl,
            nodeId: message.nodeId,
            event: message.event,
          },
        ],
      };

    default:
      return state;
  }
}
