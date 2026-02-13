//used to send messages via websocket to backend
import { useRef } from 'react';
import type { WebSocketLike } from 'react-use-websocket/dist/lib/types';

import { useLogContext } from '../contexts/LogContext';
import { useUrlContext } from '../contexts/UrlContext';
import { useSocket } from './use-socket';

export function useSendMessage() {
  const socket: WebSocketLike = useSocket();
  const { setLogs } = useLogContext();
  const { url: contextUrl } = useUrlContext();

  function sendMessage(type: 'connect' | 'disconnect' | string, url = null) {
    if (!contextUrl && !url) {
      setLogs((prev) => prev + '❌ No OPC UA Server URL set.\n');
      return;
    }

    const msg = `${type}|${url ? url : contextUrl}`;

    if (socket?.readyState === WebSocket.OPEN) {
      (socket as WebSocket).send(msg);
      setLogs((prev) => prev + `Sent: ${msg}\n`);
    } else {
      setLogs((prev) => prev + `❌ WebSocket not ready (state ${socket?.readyState})\n`);
    }

    localStorage.setItem('lastOpcUaUrl', url ? url : contextUrl);
  }

  return {
    sendMessage,
  };
}
