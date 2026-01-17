// useSubscriptions.ts - Hook für Variable-Subscriptions mit Polling

import { useState, useEffect, useRef, useCallback } from "react";
import { UaNode, REST_BACKEND_BASE } from "../types";

export type Subscription = {
  nodeId: string;
  displayName: string;
  value: string | null;
};

const POLL_MS = 2000;

export function useSubscriptions(opcUaUrl: string, socket: WebSocket | null) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const pollRef = useRef<number | null>(null);

  // ========== ADD SUBSCRIPTION ==========
  const addSubscription = useCallback((node: UaNode) => {
    // Nur Variables (NodeClass 2) können abonniert werden
    if (node.nodeClass.toLowerCase() !== "variable") {
      console.warn("[useSubscriptions] Can only subscribe to Variables");
      return;
    }

    // Prüfen ob bereits abonniert
    if (subscriptions.find(s => s.nodeId === node.nodeId)) {
      console.log("[useSubscriptions] Already subscribed to", node.nodeId);
      return;
    }

    // WebSocket-Nachricht senden
    if (socket && socket.readyState === WebSocket.OPEN && opcUaUrl) {
      const payload = JSON.stringify({ url: opcUaUrl, nodeId: node.nodeId });
      const msg = `subscribe|${payload}`;
      socket.send(msg);
      console.log("[useSubscriptions] Sent subscribe:", msg);
    }

    // State aktualisieren
    setSubscriptions(prev => [
      ...prev,
      { nodeId: node.nodeId, displayName: node.displayName, value: null }
    ]);
  }, [subscriptions, socket, opcUaUrl]);

  // ========== REMOVE SUBSCRIPTION ==========
  const removeSubscription = useCallback((nodeId: string) => {
    // WebSocket-Nachricht senden
    if (socket && socket.readyState === WebSocket.OPEN && opcUaUrl) {
      const payload = JSON.stringify({ url: opcUaUrl, nodeId });
      const msg = `unsubscribe|${payload}`;
      socket.send(msg);
      console.log("[useSubscriptions] Sent unsubscribe:", msg);
    }

    // State aktualisieren
    setSubscriptions(prev => prev.filter(s => s.nodeId !== nodeId));
  }, [socket, opcUaUrl]);

  // ========== POLLING für Werte ==========
  useEffect(() => {
    // Altes Interval aufräumen
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    // Nichts zu pollen
    if (subscriptions.length === 0 || !opcUaUrl) return;

    const poll = async () => {
      const results = await Promise.all(
        subscriptions.map(async (s) => {
          try {
            const encodedUrl = encodeURIComponent(opcUaUrl);
            const encodedNodeId = encodeURIComponent(s.nodeId);
            const res = await fetch(
              `${REST_BACKEND_BASE}/node_value?url=${encodedUrl}&nodeid=${encodedNodeId}`
            );

            if (!res.ok) {
              return { nodeId: s.nodeId, value: `error(${res.status})` };
            }

            let payload: any;
            try {
              payload = await res.json();
            } catch {
              payload = await res.text();
            }

            const value = payload?.value ?? 
              (typeof payload === "string" ? payload : JSON.stringify(payload));
            
            return { nodeId: s.nodeId, value: String(value) };
          } catch (err: any) {
            console.error("[useSubscriptions] Poll error:", s.nodeId, err);
            return { nodeId: s.nodeId, value: `error(${err?.message ?? "network"})` };
          }
        })
      );

      // Werte aktualisieren
      setSubscriptions(prev =>
        prev.map(p => {
          const r = results.find(x => x.nodeId === p.nodeId);
          return r ? { ...p, value: r.value } : p;
        })
      );
    };

    // Sofort pollen und dann alle POLL_MS
    poll();
    pollRef.current = window.setInterval(poll, POLL_MS);

    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [subscriptions.length, opcUaUrl]); // Nur bei Längenänderung neu starten

  return {
    subscriptions,
    addSubscription,
    removeSubscription,
  };
}
