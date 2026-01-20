// useMethodCall.ts - Hook für OPC UA Method Calls

import { useState, useEffect, useCallback } from "react";
import { UaNode } from "../types";
import { fetchReferences, fetchNodeValue } from "../api";


export type InputArgTuple = [name: string, type: number];
export type MethodCallState = {
  isOpen: boolean;
  node: UaNode | null;
  inputs: InputArgTuple[];
  inputValues: Record<string, string>;
  result: string | null;
  isLoading: boolean;
};

export function useMethodCall(opcUaUrl: string, socket: WebSocket | null) {
  const [state, setState] = useState<MethodCallState>({
    isOpen: false,
    node: null,
    inputs: [],
    inputValues: {},
    result: null,
    isLoading: false,
  });

  // ========== OPEN DIALOG ==========
  const openMethodDialog = useCallback(async (node: UaNode) => {
    if (node.nodeClass.toLowerCase() !== "method") {
      console.warn("[useMethodCall] Can only call Methods");
      return;
    }
    let inputArgTuples: InputArgTuple[] = [];
    try {
      // Hole die References und finde InputArguments-NodeId
      const refs = await fetchReferences(opcUaUrl, node.nodeId);
      const inputArgRef = refs.find(ref => ref.BrowseName === "0:InputArguments");
      if (inputArgRef) {
        try {
          const valueRaw = await fetchNodeValue(opcUaUrl, inputArgRef.NodeId);
          let value: any = [];
          try {
            value = JSON.parse(valueRaw);
          } catch {
            value = valueRaw;
          }
          // OPC UA InputArguments ist meist ein Array von Argument-Objekten mit Name und DataType
          if (Array.isArray(value)) {
            inputArgTuples = value.map((arg: any) => [
              arg.Name || "arg",
              arg.DataType && typeof arg.DataType === "object" && "Identifier" in arg.DataType ? arg.DataType.Identifier : arg.DataType
            ]);
          }
        } catch (err) {
          console.warn("[useMethodCall] Error fetching/parsing InputArguments value:", err);
        }
      }
    } catch (e) {
      console.warn("[useMethodCall] Could not fetch input arguments:", e);
    }
    setState({
      isOpen: true,
      node,
      inputs: inputArgTuples,
      inputValues: {},
      result: null,
      isLoading: false,
    });
  }, [opcUaUrl]);

  // ========== CLOSE DIALOG ==========
  const closeMethodDialog = useCallback(() => {
    setState({
      isOpen: false,
      node: null,
      inputs: [],
      inputValues: {},
      result: null,
      isLoading: false,
    });
  }, []);

  // ========== SET INPUTS ==========
  // Setze einen einzelnen Input-Wert
  const setInputValue = useCallback((name: string, value: string) => {
    setState(prev => ({ ...prev, inputValues: { ...prev.inputValues, [name]: value } }));
  }, []);

  // ========== CALL METHOD ==========
  const callMethod = useCallback(() => {
    if (!state.node || !socket || socket.readyState !== WebSocket.OPEN || !opcUaUrl) {
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
  }, [state.node, state.inputValues, socket, opcUaUrl]);

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
    inputs: state.inputs,
    inputValues: state.inputValues,
    result: state.result,
    isLoading: state.isLoading,
    // Actions
    openMethodDialog,
    closeMethodDialog,
    setInputValue,
    callMethod,
  };
}
