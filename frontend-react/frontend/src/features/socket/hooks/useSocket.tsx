//this hook ist used for providing a websocket connection throughout the app

import { createContext, type PropsWithChildren, useContext } from 'react';
import useWebSocket from 'react-use-websocket';
import type { WebSocketHook, WebSocketLike } from 'react-use-websocket/dist/lib/types';
import { WEBSOCKET_URL } from '../../../app/config/backendEndpoints';

//this context is later wrapped around the app in App.tsx in order to keep track of current websocket connection
type SocketContextType = WebSocketHook | null;

export const SocketContext = createContext<SocketContextType>(null);

// Super Hacky. Refer to: https://github.com/oven-sh/bun/issues/3138
const useWs = (useWebSocket as any).default as typeof useWebSocket;

export function SocketProvider(props: PropsWithChildren) {
  const wsCtx = useWs(WEBSOCKET_URL, undefined, true);
  /* if (wsCtx.readyState !== ReadyState.OPEN) {
      return (
        <div>
          <pre>  {JSON.stringify(wsCtx, null, 2)}</pre>
          <p>You are not connected.</p>
          <code>Status: {wsCtx.readyState}</code>
        </div>
      )
    }*/

  return <SocketContext.Provider value={wsCtx}>{props.children}</SocketContext.Provider>;
}

// used like : const socket = useSocket(); in order to use the websocket connection
// returns null until the WebSocket instance exists
export function useSocket(): WebSocketLike | null {
  const wsCtx = useContext(SocketContext);
  const socket = wsCtx?.getWebSocket();
  return socket ?? null;
}
