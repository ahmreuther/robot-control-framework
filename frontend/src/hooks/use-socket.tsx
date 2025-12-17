import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import type { WebSocketHook, WebSocketLike } from "react-use-websocket/dist/lib/types";

type SocketContextType = WebSocketHook | null

export const SocketContext = createContext<SocketContextType>(null);

export type SocketProviderProps = PropsWithChildren<{
    readonly url: string
}>

// Super Hacky. Refer to: https://github.com/oven-sh/bun/issues/3138
const useWs = (useWebSocket as any).default as typeof useWebSocket

export function SocketProvider(props: SocketProviderProps) {
    const wsCtx = useWs(props.url, undefined, true);
    if (wsCtx.readyState !== ReadyState.OPEN) {
      return (
        <div>
          <p>You are not connected.</p>
          <code>Status: {wsCtx.readyState}</code>
        </div>
      )
    }

    return (
        <SocketContext.Provider value={wsCtx}>
          {props.children}
        </SocketContext.Provider>
    )
}

// export function initSocket(url: string) {
//   if (!socket || socket.readyState === WebSocket.CLOSED) {
//     socket = new WebSocket(url);

//     socket.onopen = () => console.log("WebSocket connected");
//     socket.onmessage = (event) => console.log("Message from backend:", event.data);
//     socket.onclose = () => console.log("WebSocket closed");
//     socket.onerror = (err) => console.error("WebSocket error", err);
//   }

//   return socket;
// }

// export function getSocket() {
//   return socket;
// }

export function useSocket(): WebSocketLike {
  const wsCtx = useContext(SocketContext)
  const socket = wsCtx?.getWebSocket()
  if (!socket) {
    throw new Error("useSocket must be used within a SocketContext.Provider");
  }

  return socket;
}