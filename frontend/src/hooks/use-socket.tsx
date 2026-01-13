//this hook ist used for providing a websocket connection throughout the app

import { createContext, useContext, type PropsWithChildren } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import type { WebSocketHook, WebSocketLike } from "react-use-websocket/dist/lib/types";

//this context is later wrapped around the app in App.tsx in order to keep track of current websocket connection
type SocketContextType = WebSocketHook | null

export const SocketContext = createContext<SocketContextType>(null);

export type SocketProviderProps = PropsWithChildren<{
    readonly url: string
}>

// Super Hacky. Refer to: https://github.com/oven-sh/bun/issues/3138
const useWs = (useWebSocket as any).default as typeof useWebSocket

export function SocketProvider(props: SocketProviderProps) {
    const wsCtx = useWs(props.url, undefined, true);
   /* if (wsCtx.readyState !== ReadyState.OPEN) {
      return (
        <div>
          <pre>  {JSON.stringify(wsCtx, null, 2)}</pre>
          <p>You are not connected.</p>
          <code>Status: {wsCtx.readyState}</code>
        </div>
      )
    }*/

    return (
        <SocketContext.Provider value={wsCtx}>
          {props.children}
        </SocketContext.Provider>
    )
}

// used like : const socket = useSocket(); in order to use the websocket connection
// returns null until the WebSocket instance exists
export function useSocket(): WebSocketLike | null {
  const wsCtx = useContext(SocketContext);
  const socket = wsCtx?.getWebSocket();
  return socket ?? null;
}