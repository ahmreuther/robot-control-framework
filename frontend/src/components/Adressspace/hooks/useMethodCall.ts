// useMethodCall.ts - Hook für OPC UA Method Calls

import { useState, useEffect, useCallback } from "react";
import { UaNode } from "../types";

export type MethodCallState = {
  isOpen: boolean;
  node: UaNode | null;
  inputsJSON: string;
  result: string | null;
  isLoading: boolean;
};

export function useMethodCall(opcUaUrl: string, socket: WebSocket | null) {
  const [state, setState] = useState<MethodCallState>({
    isOpen: false,
    node: null,
    inputsJSON: "{}",
    result: null,
    isLoading: false,
  });

  // ========== OPEN DIALOG ==========
  const openMethodDialog = useCallback((node: UaNode) => {
    // Nur Methods (NodeClass 4) können aufgerufen werden
    if (node.nodeClass.toLowerCase() !== "method") {
      console.warn("[useMethodCall] Can only call Methods");
      return;
    }

    setState({
      isOpen: true,
      node,
      inputsJSON: "{}",
      result: null,
      isLoading: false,
    });
  }, []);

  // ========== CLOSE DIALOG ==========
  const closeMethodDialog = useCallback(() => {
    setState({
      isOpen: false,
      node: null,
      inputsJSON: "{}",
      result: null,
      isLoading: false,
    });
  }, []);

  // ========== SET INPUTS ==========
  const setInputsJSON = useCallback((json: string) => {
    setState(prev => ({ ...prev, inputsJSON: json }));
  }, []);

  // ========== CALL METHOD ==========
  const callMethod = useCallback(() => {
    if (!state.node || !socket || socket.readyState !== WebSocket.OPEN || !opcUaUrl) {
      return;
    }

    try {
      const inputs = JSON.parse(state.inputsJSON);
      const payload = JSON.stringify({
        url: opcUaUrl,
        nodeId: state.node.nodeId,
        inputs,
      });

      const msg = `call|${payload}`;
      socket.send(msg);
      console.log("[useMethodCall] Sent method call:", msg);

      setState(prev => ({
        ...prev,
        isLoading: true,
        result: "Calling method...",
      }));
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        result: `❌ Invalid JSON: ${err.message}`,
      }));
    }
  }, [state.node, state.inputsJSON, socket, opcUaUrl]);

  // ========== LISTEN FOR RESULTS ==========
  useEffect(() => {
    if (!socket || !state.isOpen) return;

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.startsWith("Method call result:")) {
        const result = message.replace("Method call result:", "").trim();
        setState(prev => ({
          ...prev,
          result,
          isLoading: false,
        }));
      } else if (message.startsWith("❌") && message.toLowerCase().includes("method")) {
        setState(prev => ({
          ...prev,
          result: message,
          isLoading: false,
        }));
      }
    };

    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [socket, state.isOpen]);

  return {
    // State
    isOpen: state.isOpen,
    methodNode: state.node,
    inputsJSON: state.inputsJSON,
    result: state.result,
    isLoading: state.isLoading,
    // Actions
    openMethodDialog,
    closeMethodDialog,
    setInputsJSON,
    callMethod,
  };
}
