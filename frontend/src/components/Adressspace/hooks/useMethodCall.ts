// useMethodCall.ts - Hook für OPC UA Method Calls

import { message } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { useLoading } from '../../../contexts/LoadingContext';
import { fetchNodeValue, fetchReferences } from '../api';
import type { UaNode } from '../types';
import { JointStateManager, WRITER_ID, WRITER_PRIORITY } from '../../../hooks/useJointState';
import { useSyncExternalStore } from 'react';

export type InputArgTuple = [name: string, type: number];
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
};

const INITIAL_DIRECT_METHOD_CALL_STATUS: DirectMethodCallStatusState = {
  status: 'Ready',
  lastSentAt: null,
  lastResultAt: null,
  lastNodeId: null,
  lastResult: null,
};

let directMethodCallStatusStore: DirectMethodCallStatusState = INITIAL_DIRECT_METHOD_CALL_STATUS;
const directMethodCallStatusListeners = new Set<() => void>();

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
  jointManager?: JointStateManager,
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
            let value: any = [];
            try {
              value = JSON.parse(valueRaw);
            } catch {
              value = valueRaw;
            }

            if (Array.isArray(value)) {
              return value.map(
                (arg: any) =>
                  [
                    arg.Name || 'arg',
                    arg.DataType && typeof arg.DataType === 'object' && 'Identifier' in arg.DataType
                      ? arg.DataType.Identifier
                      : arg.DataType,
                  ] as InputArgTuple,
              );
            }
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
      const payload = JSON.stringify({
        url: opcUaUrl,
        nodeId: state.node.nodeId,
        inputs: state.inputValues,
      });
      const msg = `call|${payload}`;
      socket.send(msg);
      console.log('[useMethodCall] Sent method call:', msg);

      // Show loading message
      const hideLoading = message.loading(`Calling method ${state.node.displayName}`, 0);

      setState((prev) => ({
        ...prev,
        isLoading: true,
        result: 'Calling method...',
        _hideLoading: hideLoading,
      }));
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        result: `Invalid JSON: ${err.message}`,
      }));
    }
  }, [state.node, state.inputValues, socket, opcUaUrl]);

  // ================= DIRECT + FETCH METHOD =================
  const directCallMethod = useCallback(
    async (node: UaNode, inputValues?: Record<string, any>) => {
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
          let value: any = [];
          try {
            value = JSON.parse(valueRaw);
          } catch {
            value = valueRaw;
          }
          if (Array.isArray(value)) {
            inputArgTuples = value.map((arg: any) => [
              arg.Name || 'arg',
              arg.DataType && typeof arg.DataType === 'object' && 'Identifier' in arg.DataType
                ? arg.DataType.Identifier
                : arg.DataType,
            ]);
          }
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
        const payload = JSON.stringify({
          url: opcUaUrl,
          nodeId: node.nodeId,
          inputs: finalInputs,
        });
        activeSocket.send(`call|${payload}`);
        console.log(`call|${payload}`);

        updateDirectMethodCallStatusStore({
          status: 'Pending',
          lastSentAt: Date.now(),
          lastNodeId: node.nodeId,
          lastResult: null,
        });

        setState((prev) => ({
          ...prev,
          node,
          inputs: inputArgTuples,
          isLoading: true,
          result: 'Calling method...',
        }));
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          node,
          inputs: inputArgTuples,
          isLoading: false,
          result: `❌ Invalid JSON: ${err.message}`,
        }));
      }
    },
    [opcUaUrl, socket],
  );

  useEffect(() => {
    if (!socket) return;

    const handleDirectMethodCallStatus = (event: MessageEvent) => {
      if (directMethodCallStatusStore.status !== 'Pending') {
        return;
      }

      const message = String(event.data ?? '');

      if (message.startsWith('Method call result:')) {
        const result = message.replace('Method call result:', '').trim();
        updateDirectMethodCallStatusStore({
          status: 'Ready',
          lastResultAt: Date.now(),
          lastResult: result,
        });
      } else if (message.startsWith('❌') && message.toLowerCase().includes('method')) {
        updateDirectMethodCallStatusStore({
          status: 'Ready',
          lastResultAt: Date.now(),
          lastResult: message,
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
