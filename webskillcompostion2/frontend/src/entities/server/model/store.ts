import type { ServerMessage } from '../../../shared/api/messages';
import type {
  AddressSpaceNode,
  AddressSpaceNodeDetails,
  AddressSpaceReference,
} from '../../opcua/model/types';
import type { RobotSessionInfo } from '../../robot/model/types';
import type { ServerSessionInfo } from './types';

export interface ServerErrorRecord {
  requestId?: string | null;
  serverUrl?: string | null;
  motionDeviceId?: string | null;
  message: string;
  code?: string | null;
}

export interface MethodResultRecord {
  requestId?: string | null;
  serverUrl: string;
  motionDeviceId?: string | null;
  nodeId?: string | null;
  result: unknown;
}

export type MethodCallStatus = 'pending' | 'succeeded' | 'failed';

export interface MethodCallStatusRecord {
  requestId: string;
  status: MethodCallStatus;
  serverUrl?: string | null;
  motionDeviceId?: string | null;
  nodeId?: string | null;
  method?: string | null;
  result?: unknown;
  error?: ServerErrorRecord;
}

export interface NodeValueRecord {
  serverUrl: string;
  nodeId: string;
  value: unknown;
  motionDeviceId?: string | null;
}

export interface OpcUaEventRecord {
  serverUrl: string;
  nodeId: string;
  event: unknown;
}

export type AddressSpaceRequestStatus =
  | 'idle'
  | 'loading'
  | 'succeeded'
  | 'failed';

interface AddressSpacePendingRequest {
  serverUrl: string;
  kind: 'root' | 'children' | 'references' | 'details';
  nodeId?: string;
}

export interface AddressSpaceServerState {
  nodesById: Record<string, AddressSpaceNode>;
  detailsByNodeId: Record<string, AddressSpaceNodeDetails>;
  referencesByNodeId: Record<string, AddressSpaceReference[]>;
  rootNodeIds: string[];
  childrenByNodeId: Record<string, string[]>;
  rootRequestStatus: AddressSpaceRequestStatus;
  childRequestStatusByNodeId: Record<string, AddressSpaceRequestStatus>;
  detailRequestStatusByNodeId: Record<string, AddressSpaceRequestStatus>;
  referenceRequestStatusByNodeId: Record<string, AddressSpaceRequestStatus>;
  expandedNodeIds: string[];
  selectedNodeId: string | null;
  error: string | null;
}

export interface AddressSpaceState {
  byServerUrl: Record<string, AddressSpaceServerState>;
  pendingRequestsById: Record<string, AddressSpacePendingRequest>;
}

export interface ServerStoreState {
  byUrl: Record<string, ServerSessionInfo>;
  motionDevicesById: Record<string, RobotSessionInfo>;
  activeServerUrl: string | null;
  errors: ServerErrorRecord[];
  methodResults: MethodResultRecord[];
  methodCallStatuses: Record<string, MethodCallStatusRecord>;
  nodeValues: Record<string, NodeValueRecord>;
  opcuaEvents: OpcUaEventRecord[];
  subscribedNodeKeys: string[];
  subscribedEventNodeKeys: string[];
  addressSpace: AddressSpaceState;
}

export const initialServerStoreState: ServerStoreState = {
  byUrl: {},
  motionDevicesById: {},
  activeServerUrl: null,
  errors: [],
  methodResults: [],
  methodCallStatuses: {},
  nodeValues: {},
  opcuaEvents: [],
  subscribedNodeKeys: [],
  subscribedEventNodeKeys: [],
  addressSpace: {
    byServerUrl: {},
    pendingRequestsById: {},
  },
};

export function selectActiveServer(
  state: ServerStoreState,
  serverUrl: string | null,
): ServerStoreState {
  if (serverUrl !== null && !state.byUrl[serverUrl]) {
    throw new Error(`Server "${serverUrl}" is not known.`);
  }

  return {
    ...state,
    activeServerUrl: serverUrl,
  };
}

export function serverNodeKey(serverUrl: string, nodeId: string): string {
  return `${serverUrl}::${nodeId}`;
}

export function serverNodeKeyPrefix(serverUrl: string): string {
  return `${serverUrl}::`;
}

export function serverNodeIdFromKey(
  serverUrl: string,
  key: string,
): string | null {
  const prefix = serverNodeKeyPrefix(serverUrl);
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

function createAddressSpaceServerState(): AddressSpaceServerState {
  return {
    nodesById: {},
    detailsByNodeId: {},
    referencesByNodeId: {},
    rootNodeIds: [],
    childrenByNodeId: {},
    rootRequestStatus: 'idle',
    childRequestStatusByNodeId: {},
    detailRequestStatusByNodeId: {},
    referenceRequestStatusByNodeId: {},
    expandedNodeIds: [],
    selectedNodeId: null,
    error: null,
  };
}

function ensureAddressSpaceServerState(
  state: ServerStoreState,
  serverUrl: string,
): AddressSpaceServerState {
  return state.addressSpace.byServerUrl[serverUrl] ?? createAddressSpaceServerState();
}

function filterKeysForServer(keys: string[], serverUrl: string): string[] {
  const prefix = `${serverUrl}::`;
  return keys.filter((key) => !key.startsWith(prefix));
}

function filterNodeValuesForServer(
  nodeValues: Record<string, NodeValueRecord>,
  serverUrl: string,
): Record<string, NodeValueRecord> {
  return Object.fromEntries(
    Object.entries(nodeValues).filter(([key]) => !key.startsWith(`${serverUrl}::`)),
  );
}

function filterAddressSpaceForServer(
  addressSpace: AddressSpaceState,
  serverUrl: string,
): AddressSpaceState {
  if (!addressSpace.byServerUrl[serverUrl]) {
    return addressSpace;
  }

  const nextByServerUrl = { ...addressSpace.byServerUrl };
  delete nextByServerUrl[serverUrl];
  return {
    ...addressSpace,
    byServerUrl: nextByServerUrl,
    pendingRequestsById: Object.fromEntries(
      Object.entries(addressSpace.pendingRequestsById).filter(
        ([, request]) => request.serverUrl !== serverUrl,
      ),
    ),
  };
}

function filterEventsForServer(
  events: OpcUaEventRecord[],
  serverUrl: string,
): OpcUaEventRecord[] {
  return events.filter((event) => event.serverUrl !== serverUrl);
}

function removeMotionDevicesForServer(
  motionDevicesById: Record<string, RobotSessionInfo>,
  serverUrl: string,
): Record<string, RobotSessionInfo> {
  return Object.fromEntries(
    Object.entries(motionDevicesById).filter(
      ([, motionDevice]) => motionDevice.serverUrl !== serverUrl,
    ),
  );
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

export function markNodeSubscription(
  state: ServerStoreState,
  serverUrl: string,
  nodeId: string,
): ServerStoreState {
  const key = serverNodeKey(serverUrl, nodeId);
  return {
    ...state,
    subscribedNodeKeys: state.subscribedNodeKeys.includes(key)
      ? state.subscribedNodeKeys
      : [...state.subscribedNodeKeys, key],
  };
}

export function unmarkNodeSubscription(
  state: ServerStoreState,
  serverUrl: string,
  nodeId: string,
): ServerStoreState {
  const key = serverNodeKey(serverUrl, nodeId);
  return {
    ...state,
    subscribedNodeKeys: state.subscribedNodeKeys.filter((current) => current !== key),
  };
}

export function markEventSubscription(
  state: ServerStoreState,
  serverUrl: string,
  nodeId: string,
): ServerStoreState {
  const key = serverNodeKey(serverUrl, nodeId);
  return {
    ...state,
    subscribedEventNodeKeys: state.subscribedEventNodeKeys.includes(key)
      ? state.subscribedEventNodeKeys
      : [...state.subscribedEventNodeKeys, key],
  };
}

export function unmarkEventSubscription(
  state: ServerStoreState,
  serverUrl: string,
  nodeId: string,
): ServerStoreState {
  const key = serverNodeKey(serverUrl, nodeId);
  return {
    ...state,
    subscribedEventNodeKeys: state.subscribedEventNodeKeys.filter(
      (current) => current !== key,
    ),
  };
}

export function requestAddressSpaceRoot(
  state: ServerStoreState,
  serverUrl: string,
  requestId: string,
): ServerStoreState {
  const serverState = ensureAddressSpaceServerState(state, serverUrl);
  return {
    ...state,
    addressSpace: {
      ...state.addressSpace,
      pendingRequestsById: {
        ...state.addressSpace.pendingRequestsById,
        [requestId]: {
          serverUrl,
          kind: 'root',
        },
      },
      byServerUrl: {
        ...state.addressSpace.byServerUrl,
        [serverUrl]: {
          ...serverState,
          rootRequestStatus: 'loading',
          error: null,
        },
      },
    },
  };
}

export function requestAddressSpaceChildren(
  state: ServerStoreState,
  serverUrl: string,
  nodeId: string,
  requestId: string,
): ServerStoreState {
  const serverState = ensureAddressSpaceServerState(state, serverUrl);
  return {
    ...state,
    addressSpace: {
      ...state.addressSpace,
      pendingRequestsById: {
        ...state.addressSpace.pendingRequestsById,
        [requestId]: {
          serverUrl,
          kind: 'children',
          nodeId,
        },
      },
      byServerUrl: {
        ...state.addressSpace.byServerUrl,
        [serverUrl]: {
          ...serverState,
          childRequestStatusByNodeId: {
            ...serverState.childRequestStatusByNodeId,
            [nodeId]: 'loading',
          },
          error: null,
        },
      },
    },
  };
}

export function requestAddressSpaceReferences(
  state: ServerStoreState,
  serverUrl: string,
  nodeId: string,
  requestId: string,
): ServerStoreState {
  const serverState = ensureAddressSpaceServerState(state, serverUrl);
  return {
    ...state,
    addressSpace: {
      ...state.addressSpace,
      pendingRequestsById: {
        ...state.addressSpace.pendingRequestsById,
        [requestId]: {
          serverUrl,
          kind: 'references',
          nodeId,
        },
      },
      byServerUrl: {
        ...state.addressSpace.byServerUrl,
        [serverUrl]: {
          ...serverState,
          referenceRequestStatusByNodeId: {
            ...serverState.referenceRequestStatusByNodeId,
            [nodeId]: 'loading',
          },
          error: null,
        },
      },
    },
  };
}

export function requestAddressSpaceNodeDetails(
  state: ServerStoreState,
  serverUrl: string,
  nodeId: string,
  requestId: string,
): ServerStoreState {
  const serverState = ensureAddressSpaceServerState(state, serverUrl);
  return {
    ...state,
    addressSpace: {
      ...state.addressSpace,
      pendingRequestsById: {
        ...state.addressSpace.pendingRequestsById,
        [requestId]: {
          serverUrl,
          kind: 'details',
          nodeId,
        },
      },
      byServerUrl: {
        ...state.addressSpace.byServerUrl,
        [serverUrl]: {
          ...serverState,
          detailRequestStatusByNodeId: {
            ...serverState.detailRequestStatusByNodeId,
            [nodeId]: 'loading',
          },
          error: null,
        },
      },
    },
  };
}

export function selectAddressSpaceNode(
  state: ServerStoreState,
  serverUrl: string,
  nodeId: string | null,
): ServerStoreState {
  const serverState = ensureAddressSpaceServerState(state, serverUrl);
  return {
    ...state,
    addressSpace: {
      ...state.addressSpace,
      byServerUrl: {
        ...state.addressSpace.byServerUrl,
        [serverUrl]: {
          ...serverState,
          selectedNodeId: nodeId,
        },
      },
    },
  };
}

export function setExpandedAddressSpaceNodes(
  state: ServerStoreState,
  serverUrl: string,
  nodeIds: string[],
): ServerStoreState {
  const serverState = ensureAddressSpaceServerState(state, serverUrl);
  return {
    ...state,
    addressSpace: {
      ...state.addressSpace,
      byServerUrl: {
        ...state.addressSpace.byServerUrl,
        [serverUrl]: {
          ...serverState,
          expandedNodeIds: [...nodeIds],
        },
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
      const nextMotionDevicesById = { ...state.motionDevicesById };
      for (const motionDevice of message.robots) {
        nextMotionDevicesById[motionDevice.robotId] = motionDevice;
      }
      const server: ServerSessionInfo = {
        serverUrl: message.serverUrl,
        status: current?.status ?? 'connected',
        namespaceUris: current?.namespaceUris ?? [],
        isRoboticsServer: current?.isRoboticsServer ?? true,
        motionDeviceIds: message.robots.map((robot) => robot.robotId),
      };

      return {
        ...state,
        byUrl: {
          ...state.byUrl,
          [message.serverUrl]: server,
        },
        motionDevicesById: nextMotionDevicesById,
        activeServerUrl: state.activeServerUrl ?? message.serverUrl,
      };
    }

    case 'serverDisconnected':
      if (!state.byUrl[message.serverUrl]) {
        return {
          ...state,
          activeServerUrl:
            state.activeServerUrl === message.serverUrl ? null : state.activeServerUrl,
        };
      }

      // Removing the server entry keeps the UI aligned with the user's
      // mental model: disconnected means this server instance is gone.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [message.serverUrl]: _removedServer, ...remainingServers } = state.byUrl;
      const remainingServerUrls = Object.keys(remainingServers);
      return {
        ...state,
        byUrl: remainingServers,
        motionDevicesById: removeMotionDevicesForServer(
          state.motionDevicesById,
          message.serverUrl,
        ),
        nodeValues: filterNodeValuesForServer(state.nodeValues, message.serverUrl),
        opcuaEvents: filterEventsForServer(state.opcuaEvents, message.serverUrl),
        subscribedNodeKeys: filterKeysForServer(
          state.subscribedNodeKeys,
          message.serverUrl,
        ),
        subscribedEventNodeKeys: filterKeysForServer(
          state.subscribedEventNodeKeys,
          message.serverUrl,
        ),
        addressSpace: filterAddressSpaceForServer(
          state.addressSpace,
          message.serverUrl,
        ),
        activeServerUrl:
          state.activeServerUrl === message.serverUrl
            ? remainingServerUrls[0] ?? null
            : state.activeServerUrl,
      };

    case 'methodResult':
      return {
        ...state,
        methodResults: [
          ...state.methodResults,
          {
            requestId: message.requestId,
            serverUrl: message.serverUrl,
            motionDeviceId: message.robotId,
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
                  motionDeviceId: message.robotId,
                  nodeId: message.nodeId,
                }),
                status: 'succeeded',
                serverUrl: message.serverUrl,
                motionDeviceId: message.robotId,
                nodeId: message.nodeId,
                result: message.result,
              },
            }
          : state.methodCallStatuses,
      };

    case 'nodeValueChanged':
      return {
        ...state,
        nodeValues: {
          ...state.nodeValues,
          [serverNodeKey(message.serverUrl, message.nodeId)]: {
            serverUrl: message.serverUrl,
            nodeId: message.nodeId,
            value: message.value,
            motionDeviceId: message.robotId,
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

    case 'addressSpaceRoot': {
      const serverState = ensureAddressSpaceServerState(state, message.serverUrl);
      const nextNodesById = { ...serverState.nodesById };
      for (const node of message.nodes) {
        nextNodesById[node.nodeId] = node;
      }
      const nextPendingRequestsById = { ...state.addressSpace.pendingRequestsById };
      if (message.requestId) {
        delete nextPendingRequestsById[message.requestId];
      }
      return {
        ...state,
        addressSpace: {
          ...state.addressSpace,
          pendingRequestsById: nextPendingRequestsById,
          byServerUrl: {
            ...state.addressSpace.byServerUrl,
            [message.serverUrl]: {
              ...serverState,
              nodesById: nextNodesById,
              rootNodeIds: message.nodes.map((node) => node.nodeId),
              rootRequestStatus: 'succeeded',
              error: null,
            },
          },
        },
      };
    }

    case 'addressSpaceChildren': {
      const serverState = ensureAddressSpaceServerState(state, message.serverUrl);
      const nextNodesById = { ...serverState.nodesById };
      for (const node of message.nodes) {
        nextNodesById[node.nodeId] = node;
      }
      const nextPendingRequestsById = { ...state.addressSpace.pendingRequestsById };
      if (message.requestId) {
        delete nextPendingRequestsById[message.requestId];
      }
      return {
        ...state,
        addressSpace: {
          ...state.addressSpace,
          pendingRequestsById: nextPendingRequestsById,
          byServerUrl: {
            ...state.addressSpace.byServerUrl,
            [message.serverUrl]: {
              ...serverState,
              nodesById: nextNodesById,
              childrenByNodeId: {
                ...serverState.childrenByNodeId,
                [message.nodeId]: message.nodes.map((node) => node.nodeId),
              },
              childRequestStatusByNodeId: {
                ...serverState.childRequestStatusByNodeId,
                [message.nodeId]: 'succeeded',
              },
              error: null,
            },
          },
        },
      };
    }

    case 'addressSpaceReferences': {
      const serverState = ensureAddressSpaceServerState(state, message.serverUrl);
      const nextPendingRequestsById = { ...state.addressSpace.pendingRequestsById };
      if (message.requestId) {
        delete nextPendingRequestsById[message.requestId];
      }
      return {
        ...state,
        addressSpace: {
          ...state.addressSpace,
          pendingRequestsById: nextPendingRequestsById,
          byServerUrl: {
            ...state.addressSpace.byServerUrl,
            [message.serverUrl]: {
              ...serverState,
              referencesByNodeId: {
                ...serverState.referencesByNodeId,
                [message.nodeId]: message.references,
              },
              referenceRequestStatusByNodeId: {
                ...serverState.referenceRequestStatusByNodeId,
                [message.nodeId]: 'succeeded',
              },
              error: null,
            },
          },
        },
      };
    }

    case 'addressSpaceNodeDetails': {
      const serverState = ensureAddressSpaceServerState(state, message.serverUrl);
      const nextPendingRequestsById = { ...state.addressSpace.pendingRequestsById };
      if (message.requestId) {
        delete nextPendingRequestsById[message.requestId];
      }
      return {
        ...state,
        addressSpace: {
          ...state.addressSpace,
          pendingRequestsById: nextPendingRequestsById,
          byServerUrl: {
            ...state.addressSpace.byServerUrl,
            [message.serverUrl]: {
              ...serverState,
              detailsByNodeId: {
                ...serverState.detailsByNodeId,
                [message.nodeId]: message.details,
              },
              detailRequestStatusByNodeId: {
                ...serverState.detailRequestStatusByNodeId,
                [message.nodeId]: 'succeeded',
              },
              error: null,
            },
          },
        },
      };
    }

    case 'error': {
      if (!message.serverUrl || message.code !== 'addressSpaceBrowseFailed') {
        return {
          ...state,
          errors: [
            ...state.errors,
            {
              requestId: message.requestId,
              serverUrl: message.serverUrl,
              motionDeviceId: message.robotId,
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
                      motionDeviceId: message.robotId,
                      message: message.message,
                      code: message.code,
                    },
                  },
                }
              : state.methodCallStatuses,
        };
      }
      const serverState = ensureAddressSpaceServerState(state, message.serverUrl);
      const pendingRequest = message.requestId
        ? state.addressSpace.pendingRequestsById[message.requestId]
        : undefined;
      const nextPendingRequestsById = { ...state.addressSpace.pendingRequestsById };
      if (message.requestId) {
        delete nextPendingRequestsById[message.requestId];
      }
      return {
        ...state,
        errors: [
          ...state.errors,
          {
            requestId: message.requestId,
            serverUrl: message.serverUrl,
            motionDeviceId: message.robotId,
            message: message.message,
            code: message.code,
          },
        ],
        addressSpace: {
          ...state.addressSpace,
          pendingRequestsById: nextPendingRequestsById,
          byServerUrl: {
            ...state.addressSpace.byServerUrl,
            [message.serverUrl]: {
              ...serverState,
              rootRequestStatus:
                pendingRequest?.kind === 'root'
                  ? 'failed'
                  : serverState.rootRequestStatus,
              childRequestStatusByNodeId:
                pendingRequest?.kind === 'children' && pendingRequest.nodeId
                  ? {
                      ...serverState.childRequestStatusByNodeId,
                      [pendingRequest.nodeId]: 'failed',
                    }
                  : serverState.childRequestStatusByNodeId,
              detailRequestStatusByNodeId:
                pendingRequest?.kind === 'details' && pendingRequest.nodeId
                  ? {
                      ...serverState.detailRequestStatusByNodeId,
                      [pendingRequest.nodeId]: 'failed',
                    }
                  : serverState.detailRequestStatusByNodeId,
              referenceRequestStatusByNodeId:
                pendingRequest?.kind === 'references' && pendingRequest.nodeId
                  ? {
                      ...serverState.referenceRequestStatusByNodeId,
                      [pendingRequest.nodeId]: 'failed',
                    }
                  : serverState.referenceRequestStatusByNodeId,
              error: message.message,
            },
          },
        },
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
                    motionDeviceId: message.robotId,
                    message: message.message,
                    code: message.code,
                  },
                },
              }
            : state.methodCallStatuses,
      };
    }

    default:
      return state;
  }
}
