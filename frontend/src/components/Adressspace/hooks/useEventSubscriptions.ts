// useEventSubscriptions.ts - Hook für Event-Subscriptions

import { useCallback, useState } from 'react';

import type { UaNode } from '../types';

export interface EventSubscription {
  nodeId: string;
  displayName: string;
}

export function useEventSubscriptions(opcUaUrl: string | null, socket: WebSocket | null) {
  const [eventSubscriptions, setEventSubscriptions] = useState<EventSubscription[]>([]);

  // ========== ADD EVENT SUBSCRIPTION ==========
  const addEventSubscription = useCallback(
    (node: UaNode) => {
      // Nur Objects (NodeClass 1) können Event-Subscriptions haben
      if (node.nodeClass.toLowerCase() !== 'object') {
        console.warn('[useEventSubscriptions] Can only subscribe to Events on Objects');
        return;
      }

      // Prüfen ob bereits abonniert
      if (eventSubscriptions.find((s) => s.nodeId === node.nodeId)) {
        console.log('[useEventSubscriptions] Already subscribed to', node.nodeId);
        return;
      }

      // WebSocket-Nachricht senden
      if (socket?.readyState === WebSocket.OPEN && opcUaUrl) {
        const payload = JSON.stringify({ url: opcUaUrl, nodeId: node.nodeId });
        const msg = `subscribeEvent|${payload}`;
        socket.send(msg);
        console.log('[useEventSubscriptions] Sent subscribeEvent:', msg);
      }

      // State aktualisieren
      setEventSubscriptions((prev) => [
        ...prev,
        { nodeId: node.nodeId, displayName: node.displayName },
      ]);
    },
    [eventSubscriptions, socket, opcUaUrl],
  );

  // ========== REMOVE EVENT SUBSCRIPTION ==========
  const removeEventSubscription = useCallback(
    (nodeId: string) => {
      // WebSocket-Nachricht senden
      if (socket?.readyState === WebSocket.OPEN && opcUaUrl) {
        const payload = JSON.stringify({ url: opcUaUrl, nodeId });
        const msg = `unsubscribeEvent|${payload}`;
        socket.send(msg);
        console.log('[useEventSubscriptions] Sent unsubscribeEvent:', msg);
      }

      // State aktualisieren
      setEventSubscriptions((prev) => prev.filter((s) => s.nodeId !== nodeId));
    },
    [socket, opcUaUrl],
  );

  return {
    eventSubscriptions,
    addEventSubscription,
    removeEventSubscription,
  };
}
