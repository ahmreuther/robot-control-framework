// useMethodCall.ts - Hook für OPC UA Method Calls

import { message } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { useLoading } from '../../../contexts/LoadingContext';
import { useLogContext } from '../../../contexts/LogContext';
import { useServersContext } from '../../../contexts/ServersContext';
import { fetchNodeValue, fetchReferences } from '../api';
import type { UaNode } from '../types';
import { JointStateManager } from '../../../hooks/useJointState';
import { useSyncExternalStore } from 'react';

export type InputArgTuple = [name: string, type: number];
type UaMethodArgument = {
  Name?: string;
  DataType?: number | { Identifier?: number } | null;
};
function extractInputArgTuples(value: unknown): InputArgTuple[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((rawArg): InputArgTuple => {
    const arg = (rawArg ?? {}) as UaMethodArgument;
    const dataType = arg.DataType;
    const type =
      typeof dataType === 'object' && dataType !== null && 'Identifier' in dataType
        ? Number(dataType.Identifier ?? 0)
        : Number(dataType ?? 0);

    return [arg.Name || 'arg', type];
  });
}

export interface MethodCallState {
  isOpen: boolean;
  node: UaNode | null;
  inputs: InputArgTuple[];
  inputValues: Record<string, string>;
  result: string | null;
  isLoading: boolean;
  _hideLoading: (() => void) | null;
}

export type DirectMethodCallStatusState = {
  status: 'Pending' | 'Ready';
  lastSentAt: number | null;
  lastResultAt: number | null;
  lastNodeId: string | null;
  lastResult: string | null;
  hideLoading: (() => void) | null;
};

const INITIAL_DIRECT_METHOD_CALL_STATUS: DirectMethodCallStatusState = {
  status: 'Ready',
  lastSentAt: null,
  lastResultAt: null,
  lastNodeId: null,
  lastResult: null,
  hideLoading: null,
};

let directMethodCallStatusStore: DirectMethodCallStatusState = INITIAL_DIRECT_METHOD_CALL_STATUS;
const directMethodCallStatusListeners = new Set<() => void>();

/*
Idempotency scaffold (disabled intentionally for backend compatibility)
----------------------------------------------------------------------------
Enable once backend parser accepts optional requestId fields in call payloads.

const RECENT_REQUEST_TTL_MS = 10_000;
const recentDirectMethodRequests = new Map<string, number>();

function createMethodRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function markRequest(requestId: string) {
  const now = Date.now();
  recentDirectMethodRequests.set(requestId, now);
  for (const [id, ts] of recentDirectMethodRequests) {
    if (now - ts > RECENT_REQUEST_TTL_MS) {
      recentDirectMethodRequests.delete(id);
    }
  }
}

function wasRequestSeen(requestId: string) {
  const ts = recentDirectMethodRequests.get(requestId);
  return typeof ts === 'number' && Date.now() - ts <= RECENT_REQUEST_TTL_MS;
}
*/

function subscribeDirectMethodCallStatus(listener: () => void) {
  directMethodCallStatusListeners.add(listener);
  return () => {
    directMethodCallStatusListeners.delete(listener);
  };
}

function getDirectMethodCallStatusSnapshot() {
  return directMethodCallStatusStore;
}

function updateDirectMethodCallStatusStore(update: Partial<DirectMethodCallStatusState>) {
  // Clean up previous loading message if status changes to Ready
  if (update.status === 'Ready' && directMethodCallStatusStore.hideLoading) {
    directMethodCallStatusStore.hideLoading();
  }

  directMethodCallStatusStore = {
    ...directMethodCallStatusStore,
    ...update,
  };
  directMethodCallStatusListeners.forEach((listener) => listener());
}

export function useDirectMethodCallStatus() {
  return useSyncExternalStore(
    subscribeDirectMethodCallStatus,
    getDirectMethodCallStatusSnapshot,
    getDirectMethodCallStatusSnapshot,
  );
}

export function useMethodCall(
  opcUaUrl: string | null,
  socket: WebSocket | null,
  _jointManager?: JointStateManager,
) {
  const [state, setState] = useState<MethodCallState>({
    isOpen: false,
    node: null,
    inputs: [],
    inputValues: {},
    result: null,
    isLoading: false,
    _hideLoading: null,
  });

  const { executeWithLoading } = useLoading();
  const { appendLog } = useLogContext();
  const { activeRuntimeServerId, activeASpaceServerId } = useServersContext();
  const targetServerId = activeRuntimeServerId ?? activeASpaceServerId;

  const logOutgoingCall = useCallback(
    (mode: 'method' | 'direct', msg: string, nodeId: string, inputs: Record<string, unknown>) => {
      const ts = new Date().toISOString();
      appendLog(
        `[${ts}] OUT ${mode} call nodeId=${nodeId} inputs=${JSON.stringify(inputs)} payload=${msg}\n`,
        targetServerId,
      );
    },
    [appendLog, targetServerId],
  );

  // ========== OPEN DIALOG ==========
  const openMethodDialog = useCallback(
    async (node: UaNode) => {
      const inputArgTuples = await executeWithLoading(
        `Loading method details for ${node.displayName}`,
        async () => {
          const refs = await fetchReferences(opcUaUrl, node.nodeId);
          const inputArgRef = refs.find((ref) => ref.BrowseName === '0:InputArguments');

          if (!inputArgRef) {
            return [];
          }

          try {
            const valueRaw = await fetchNodeValue(opcUaUrl, inputArgRef.NodeId);
            let value: unknown = [];
            try {
              value = typeof valueRaw === 'string' ? JSON.parse(valueRaw) : valueRaw;
            } catch {
              value = valueRaw;
            }

            return extractInputArgTuples(value);
          } catch (err) {
            console.warn('[useMethodCall] Error fetching/parsing InputArguments value:', err);
          }

          return [];
        },
        {
          errorMessage: `Failed to load method details for "${node.displayName}" (${node.nodeId})`,
        },
      );

      setState({
        isOpen: true,
        node,
        inputs: inputArgTuples,
        inputValues: {},
        result: null,
        isLoading: false,
        _hideLoading: null,
      });
    },
    [opcUaUrl, executeWithLoading],
  );

  // ========== CLOSE DIALOG ==========
  const closeMethodDialog = useCallback(() => {
    setState({
      isOpen: false,
      node: null,
      inputs: [],
      inputValues: {},
      result: null,
      isLoading: false,
      _hideLoading: null,
    });
  }, []);

  // ========== SET INPUTS ==========
  // Setze einen einzelnen Input-Wert
  const setInputValue = useCallback((name: string, value: string) => {
    setState((prev) => ({ ...prev, inputValues: { ...prev.inputValues, [name]: value } }));
  }, []);

  // ========== CALL METHOD ==========
  const callMethod = useCallback(() => {
    if (!state.node || socket?.readyState !== WebSocket.OPEN || !opcUaUrl) {
      return;
    }
    try {
      // const requestId = createMethodRequestId(); // idempotency (disabled)
      const payload = JSON.stringify({
        url: opcUaUrl,
        nodeId: state.node.nodeId,
        inputs: state.inputValues,
        // requestId, // idempotency (disabled until backend supports it)
      });
      const msg = `call|${payload}`;
      socket.send(msg);
      console.log('[useMethodCall] Sent method call:', msg);
      logOutgoingCall('method', msg, state.node.nodeId, state.inputValues);

      // Show loading message
      const hideLoading = message.loading(`Calling method ${state.node.displayName}`, 0);

      setState((prev) => ({
        ...prev,
        isLoading: true,
        result: 'Calling method...',
        _hideLoading: hideLoading,
      }));
    } catch (err: unknown) {
      setState((prev) => ({
        ...prev,
        result: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  }, [state.node, state.inputValues, socket, opcUaUrl, logOutgoingCall]);

  // ================= DIRECT + FETCH METHOD =================
  const directCallMethod = useCallback(
    async (node: UaNode, inputValues?: Record<string, unknown>) => {
      if (!node) {
        console.warn('Cannot call method: node is missing');
        return;
      }

      // Wait for socket to be ready
      const waitForSocket = () =>
        new Promise<WebSocket>((resolve) => {
          const check = () => {
            if (socket && socket.readyState === WebSocket.OPEN) resolve(socket);
            else setTimeout(check, 50);
          };
          check();
        });

      const activeSocket = await waitForSocket();
      // Fetch InputArguments
      let inputArgTuples: InputArgTuple[] = [];
      try {
        const refs = await fetchReferences(opcUaUrl, node.nodeId);
        const inputArgRef = refs.find((ref) => ref.BrowseName === '0:InputArguments');
        if (inputArgRef) {
          const valueRaw = await fetchNodeValue(opcUaUrl, inputArgRef.NodeId);
          let value: unknown = [];
          try {
            value = typeof valueRaw === 'string' ? JSON.parse(valueRaw) : valueRaw;
          } catch {
            value = valueRaw;
          }
          inputArgTuples = extractInputArgTuples(value);
        }
      } catch (err) {
        console.warn('[callMethodDirectly] Error fetching InputArguments:', err);
      }

      const finalInputs =
        inputValues ??
        inputArgTuples.reduce(
          (acc, [name]) => {
            acc[name] = '';
            return acc;
          },
          {} as Record<string, string>,
        );

      try {
        // const requestId = createMethodRequestId(); // idempotency (disabled)
        // if (wasRequestSeen(requestId)) return; // idempotency (disabled)
        const payload = JSON.stringify({
          url: opcUaUrl,
          nodeId: node.nodeId,
          inputs: finalInputs,
          // requestId, // idempotency (disabled until backend supports it)
        });
        const msg = `call|${payload}`;
        activeSocket.send(msg);
        // markRequest(requestId); // idempotency (disabled)
        console.log(msg);
        logOutgoingCall('direct', msg, node.nodeId, finalInputs);

        // Show loading message
        const hideLoading = message.loading(`Calling method ${node.displayName}...`, 0);

        updateDirectMethodCallStatusStore({
          status: 'Pending',
          lastSentAt: Date.now(),
          lastNodeId: node.nodeId,
          lastResult: null,
          hideLoading,
        });

        setState((prev) => ({
          ...prev,
          node,
          inputs: inputArgTuples,
          isLoading: true,
          result: 'Calling method...',
        }));
      } catch (err: unknown) {
        setState((prev) => ({
          ...prev,
          node,
          inputs: inputArgTuples,
          isLoading: false,
          result: `❌ Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        }));
      }
    },
    [logOutgoingCall, opcUaUrl, socket],
  );

  useEffect(() => {
    if (!socket) return;

    const handleDirectMethodCallStatus = (event: MessageEvent) => {
      if (directMethodCallStatusStore.status !== 'Pending') {
        return;
      }

      const messageText = String(event.data ?? '');

      if (messageText.startsWith('Method call result:')) {
        const result = messageText.replace('Method call result:', '').trim();

        // Show success message
        message.success('Method call completed', 2);

        updateDirectMethodCallStatusStore({
          status: 'Ready',
          lastResultAt: Date.now(),
          lastResult: result,
          hideLoading: null,
        });
      } else if (messageText.startsWith('❌') && messageText.toLowerCase().includes('method')) {
        // Show error message
        message.error('Method call failed', 2);

        updateDirectMethodCallStatusStore({
          status: 'Ready',
          lastResultAt: Date.now(),
          lastResult: messageText,
          hideLoading: null,
        });
      }
    };

    socket.addEventListener('message', handleDirectMethodCallStatus);
    return () => socket.removeEventListener('message', handleDirectMethodCallStatus);
  }, [socket]);

  useEffect(() => {
    if (!socket || !state.isOpen) return;

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.startsWith('Method call result:')) {
        const result = message.replace('Method call result:', '').trim();
        setState((prev) => {
          // Hide loading UI if present
          if (prev._hideLoading && typeof prev._hideLoading === 'function') {
            prev._hideLoading();
          }
          return {
            ...prev,
            result,
            isLoading: false,
            _hideLoading: null,
          };
        });
      } else if (message.startsWith('❌') && message.toLowerCase().includes('method')) {
        setState((prev) => {
          // Hide loading UI if present
          if (prev._hideLoading && typeof prev._hideLoading === 'function') {
            prev._hideLoading();
          }
          return {
            ...prev,
            result: message,
            isLoading: false,
            _hideLoading: null,
          };
        });
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, state.isOpen, opcUaUrl]);

  return {
    // State
    isOpen: state.isOpen,
    methodNode: state.node,
    inputs: state.inputs,
    inputValues: state.inputValues,
    result: state.result,
    isLoading: state.isLoading,
    // Actions
    openMethodDialog,
    closeMethodDialog,
    setInputValue,
    callMethod,
    directCallMethod,
  };
}
