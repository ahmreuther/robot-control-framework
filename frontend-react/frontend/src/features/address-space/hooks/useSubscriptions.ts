import { useCallback, useEffect, useState } from 'react';

import type { UaNode } from '../model/types';

export interface Subscription {
  nodeId: string;
  displayName: string;
  value: string | null;
}

export function useSubscriptions(opcUaUrl: string | null, socket: WebSocket | null) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

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

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;

      const msg = event.data;
      if (!msg.startsWith('x|custom:')) return;

      const payloadRaw = msg.slice('x|custom:'.length);
      try {
        const payload = JSON.parse(payloadRaw);
        if (!payload?.nodeId || typeof payload.value === 'undefined') return;

        const nextValue = String(payload.value);
        setSubscriptions((prev) =>
          prev.map((p) => (p.nodeId === payload.nodeId ? { ...p, value: nextValue } : p)),
        );
      } catch (err) {
        console.warn('[useSubscriptions] Custom subscription parse error', err);
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);

  return {
    subscriptions,
    addSubscription,
    removeSubscription,
  };
}
