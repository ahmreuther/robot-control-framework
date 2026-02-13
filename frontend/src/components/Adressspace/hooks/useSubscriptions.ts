// useSubscriptions.ts - Hook für Variable-Subscriptions mit Polling

import { useCallback, useEffect, useRef, useState } from 'react';

import type { UaNode } from '../types';
import { REST_BACKEND_BASE } from '../types';

export interface Subscription {
  nodeId: string;
  displayName: string;
  value: string | null;
}

const POLL_MS = 2000;

export function useSubscriptions(opcUaUrl: string | null, socket: WebSocket | null) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const pollRef = useRef<number | null>(null);

  // ========== ADD SUBSCRIPTION ==========
  const addSubscription = useCallback(
    (node: UaNode) => {
      if (node.nodeClass.toLowerCase() !== 'variable') return;
      if (subscriptions.find((s) => s.nodeId === node.nodeId)) return;

      // WebSocket-Nachricht senden
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(`subscribe|${JSON.stringify({ url: opcUaUrl, nodeId: node.nodeId })}`);
      }
      // State aktualisieren
      setSubscriptions((prev) => [
        ...prev,
        { nodeId: node.nodeId, displayName: node.displayName, value: null },
      ]);
    },
    [subscriptions, socket, opcUaUrl],
  );

  // ========== REMOVE SUBSCRIPTION ==========
  const removeSubscription = useCallback(
    (nodeId: string) => {
      // WebSocket-Nachricht senden
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(`unsubscribe|${JSON.stringify({ url: opcUaUrl, nodeId })}`);
      }
      // State aktualisieren
      setSubscriptions((prev) => prev.filter((s) => s.nodeId !== nodeId));
    },
    [socket, opcUaUrl],
  );

  // ========== POLLING für Werte ==========
  useEffect(() => {
    // Nichts zu pollen
    if (subscriptions.length === 0 || !opcUaUrl) return;

    const poll = async () => {
      const results = await Promise.all(
        subscriptions.map(async (s) => {
          try {
            const encodedUrl = encodeURIComponent(opcUaUrl);
            const encodedNodeId = encodeURIComponent(s.nodeId);
            const res = await fetch(
              `${REST_BACKEND_BASE}/node_value?url=${encodedUrl}&nodeid=${encodedNodeId}`,
            );
            if (!res.ok) return { nodeId: s.nodeId, value: `error(${res.status})` };

            const payload = await res.json();
            const value = payload?.value ?? payload;

            return { nodeId: s.nodeId, value: String(value) };
          } catch (err: any) {
            console.error('[useSubscriptions] Poll error:', s.nodeId, err);
            return { nodeId: s.nodeId, value: `error(${err?.message ?? 'network'})` };
          }
        }),
      );

      // Werte aktualisieren
      setSubscriptions((prev) =>
        prev.map((p) => {
          const r = results.find((x) => x.nodeId === p.nodeId);
          return r ? { ...p, value: r.value } : p;
        }),
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
