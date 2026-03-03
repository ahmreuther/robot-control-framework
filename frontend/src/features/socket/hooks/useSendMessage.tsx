import { useLogContext } from '../../../app/providers/contexts';
import { useServersContext } from '../../../app/providers/contexts';
import { useSocket } from './useSocket';

export interface SendMessageOptions {
  serverId?: number | null;
  url?: string | null;
  persistUrl?: boolean;
}

export function useSendMessage() {
  const socket = useSocket();
  const { appendLog } = useLogContext();
  const {
    activeRuntimeServerId,
    activeASpaceServerId,
    findServerById,
    setActiveRuntimeServerId,
    updateServerConnectedUrl,
  } = useServersContext();

  function sendMessage(type: string, options?: SendMessageOptions) {
    const targetServerId = options?.serverId ?? activeRuntimeServerId ?? activeASpaceServerId;
    const targetServer = findServerById(targetServerId ?? null);
    const resolvedUrl = options?.url ?? targetServer?.connectedUrl ?? null;

    if (!resolvedUrl) {
      appendLog(`Error: No OPC UA Server URL set for command '${type}'.\n`, targetServerId);
      return false;
    }

    const msg = `${type}|${resolvedUrl}`;

    if (socket?.readyState === WebSocket.OPEN) {
      (socket as WebSocket).send(msg);
      const serverInfo = targetServer ? ` [${targetServer.name}]` : '';
      appendLog(`Sent${serverInfo}: ${msg}\n`, targetServerId);

      if (type === 'connect' && targetServerId !== null && targetServerId !== undefined) {
        setActiveRuntimeServerId(targetServerId);
        updateServerConnectedUrl(targetServerId, resolvedUrl);
      }

      if (type === 'disconnect') {
        setActiveRuntimeServerId(null);
      }

      if (options?.persistUrl ?? true) {
        localStorage.setItem('lastOpcUaUrl', resolvedUrl);
      }

      return true;
    }

    appendLog(`Error: WebSocket not ready (state ${socket?.readyState ?? 'unknown'}).\n`, targetServerId);
    return false;
  }

  return {
    sendMessage,
  };
}
