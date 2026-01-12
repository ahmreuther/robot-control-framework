//used to send messages via websocket to backend
import { useContext } from "react";
import { LogContext } from "/src/App";
import { useUrlContext } from "../components/UrlContext";
import { useSocket } from "./use-socket";

export function useSendMessage() {
  const socket = useSocket();
  const { logs, setLogs } = useContext(LogContext);
  const { url: contextUrl } = useUrlContext();

  function sendMessage(type: "connect" | "disconnect" | string) {
    if (!contextUrl) {
      setLogs(prev => prev + "❌ No OPC UA Server URL set.\n");
      return;
    }

    const msg = `${type}|${contextUrl}`;

    if (socket && socket.readyState === WebSocket.OPEN) {
      (socket as WebSocket).send(msg);
      setLogs(prev => prev + `Sent: ${msg}\n`);
    } else {
      setLogs(prev => prev + `❌ WebSocket not ready (state ${socket?.readyState})\n`);
    }

    localStorage.setItem("lastOpcUaUrl", contextUrl);
  }

  return {
    sendMessage
  };
}