import { useEffect, useMemo, useRef, useState } from "react";

import type { WebSocketMessageLogEntry } from "../../../shared/api/websocketClient";
import type {
  ClientMessage,
  ServerMessage,
} from "../../../shared/api/messages";
import type { RobotSessionInfo } from "../../../entities/robot/model/types";
import { onSurfaceMessageLog } from "../../../shared/api/surfaceMessageLog";
import { useOpcuaServer } from "../context/OpcuaServerContext";

function getLineColorClass(line: string) {
  const l = line.toLowerCase();

  if (l.includes(" out ") || l.startsWith("sent")) {
    return "text-cyan-300";
  }
  if (
    l.includes("received") ||
    l.includes("result:") ||
    l.includes("connected")
  ) {
    return "text-emerald-300";
  }
  if (
    l.includes("error") ||
    l.includes("failed") ||
    l.includes("not ready") ||
    l.includes("no client")
  ) {
    return "text-rose-300";
  }
  if (l.includes("warning")) {
    return "text-amber-300";
  }
  if (l.includes("abort") || l.includes("aborted")) {
    return "text-amber-300";
  }

  return "text-white/80";
}

function describeMotionDevice(
  motionDeviceId: string,
  motionDevice?: RobotSessionInfo,
): string {
  if (!motionDevice) {
    return motionDeviceId;
  }
  return `${motionDevice.displayName} (${motionDeviceId})`;
}

function resolveMotionDevice(
  motionDeviceId: string,
  motionDevicesById: Record<string, RobotSessionInfo>,
): string {
  return describeMotionDevice(
    motionDeviceId,
    motionDevicesById[motionDeviceId],
  );
}

function formatEntry(
  entry: WebSocketMessageLogEntry,
  motionDevicesById: Record<string, RobotSessionInfo>,
): string {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  if (entry.direction === "incoming") {
    return `${time} received ${describeServerMessage(
      entry.message as ServerMessage,
      motionDevicesById,
    )}`;
  }
  if (entry.direction === "queued") {
    return `${time} warning queued ${describeClientMessage(
      entry.message as ClientMessage,
      motionDevicesById,
    )}`;
  }
  return `${time} sent ${describeClientMessage(
    entry.message as ClientMessage,
    motionDevicesById,
  )}`;
}

function shouldLogEntry(entry: WebSocketMessageLogEntry): boolean {
  if (entry.direction === "incoming") {
    const type = (entry.message as ServerMessage).type;
    if (type === "robotJointState" || type === "nodeValueChanged") {
      return false;
    }
  }

  return true;
}

function describeClientMessage(
  message: ClientMessage,
  motionDevicesById: Record<string, RobotSessionInfo>,
): string {
  switch (message.type) {
    case "connectServer":
      return `connectServer -> ${message.serverUrl}`;
    case "discoverRobots":
      return `discoverRobots -> ${message.serverUrl}`;
    case "disconnectServer":
      return `disconnectServer -> ${message.serverUrl}`;
    case "subscribeRobotJoints":
    case "unsubscribeRobotJoints":
    case "subscribeRobotMode":
    case "unsubscribeRobotMode":
      return `${message.type} -> ${resolveMotionDevice(
        message.robotId,
        motionDevicesById,
      )}`;
    case "callRobotMethod":
      return `callRobotMethod ${message.method} -> ${resolveMotionDevice(
        message.robotId,
        motionDevicesById,
      )}`;
    case "executeRobotAction":
      return `executeRobotAction ${message.actionName} -> ${resolveMotionDevice(
        message.robotId,
        motionDevicesById,
      )}`;
    case "haltRobotAction":
    case "resetRobotAction":
      return `${message.type} ${message.actionName} -> ${resolveMotionDevice(
        message.robotId,
        motionDevicesById,
      )}`;
    case "subscribeNode":
    case "unsubscribeNode":
    case "subscribeEvent":
    case "unsubscribeEvent":
      return `${message.type} -> ${message.nodeId} @ ${message.serverUrl}`;
    case "callRawMethod":
      return `callRawMethod -> ${message.nodeId} @ ${message.serverUrl}`;
    case "browseAddressSpaceRoot":
      return `browseAddressSpaceRoot -> ${message.serverUrl}`;
    case "browseAddressSpaceChildren":
      return `browseAddressSpaceChildren -> ${message.nodeId} @ ${message.serverUrl}`;
    case "browseAddressSpaceReferences":
      return `browseAddressSpaceReferences -> ${message.nodeId} @ ${message.serverUrl}`;
    case "browseAddressSpaceNodeDetails":
      return `browseAddressSpaceNodeDetails -> ${message.nodeId} @ ${message.serverUrl}`;
    default:
      return JSON.stringify(message);
  }
}

function describeServerMessage(
  message: ServerMessage,
  motionDevicesById: Record<string, RobotSessionInfo>,
): string {
  switch (message.type) {
    case "serverConnected":
      return `serverConnected <- ${message.server.serverUrl}`;
    case "serverDisconnected":
      return `serverDisconnected <- ${message.serverUrl}`;
    case "robotsDiscovered":
      return `robotsDiscovered <- ${message.robots.length} robot(s) from ${message.serverUrl}`;
    case "robotInfo":
      return `robotInfo <- ${resolveMotionDevice(
        message.robotId,
        motionDevicesById,
      )}`;
    case "robotJointState":
      return `robotJointState <- ${resolveMotionDevice(
        message.robotId,
        motionDevicesById,
      )}`;
    case "robotModeChanged":
      return `robotModeChanged <- ${resolveMotionDevice(
        message.robotId,
        motionDevicesById,
      )}: ${message.mode}`;
    case "robotActionState":
      return `robotActionState <- ${resolveMotionDevice(
        message.robotId,
        motionDevicesById,
      )}: ${message.data.actionName} ${message.data.status}`;
    case "methodResult":
      return `methodResult <- ${
        message.robotId
          ? resolveMotionDevice(message.robotId, motionDevicesById)
          : (message.nodeId ?? "unknown")
      }`;
    case "nodeValueChanged":
      return `nodeValueChanged <- ${message.nodeId}`;
    case "opcuaEvent":
      return `opcuaEvent <- ${message.nodeId}`;
    case "error":
      return `error <- ${message.message}`;
    case "addressSpaceRoot":
      return `addressSpaceRoot <- ${message.nodes.length} node(s) from ${message.serverUrl}`;
    case "addressSpaceChildren":
      return `addressSpaceChildren <- ${message.nodes.length} node(s) for ${message.nodeId}`;
    case "addressSpaceReferences":
      return `addressSpaceReferences <- ${message.references.length} ref(s) for ${message.nodeId}`;
    case "addressSpaceNodeDetails":
      return `addressSpaceNodeDetails <- ${message.nodeId}`;
    default:
      return JSON.stringify(message);
  }
}

export function MessageLog() {
  const { controller } = useOpcuaServer();
  const [logs, setLogs] = useState("");
  const [filter, setFilter] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return controller.onWebSocketMessageLog((entry) => {
      if (!shouldLogEntry(entry)) {
        return;
      }
      const motionDevicesById =
        controller.getSnapshot().server.motionDevicesById;
      setLogs(
        (current) => `${current}${formatEntry(entry, motionDevicesById)}\n`,
      );
    });
  }, [controller]);

  useEffect(() => {
    return onSurfaceMessageLog((line) => {
      setLogs((current) => `${current}${line}\n`);
    });
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [logs, filter]);

  function clearLog() {
    setLogs("");
  }

  const lines = useMemo(() => {
    const arr = logs.split("\n").filter((line) => line.trim() !== "");

    const q = filter.trim().toLowerCase();
    if (!q) return arr;

    return arr.filter((line) => line.toLowerCase().includes(q));
  }, [logs, filter]);

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <header className="panel-header">
        <div className="panel-title">Message Log</div>
        <div className="flex items-center gap-2">
          <button onClick={clearLog} className="button-ghost ">
            Clear
          </button>
        </div>
      </header>
      <div className="panel-body flex h-full min-h-0 flex-col overflow-hidden">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter"
          className="input-ghost w-full text-left mb-2"
        />
        <div
          ref={scrollRef}
          className="panel min-h-0 flex-1 overflow-auto overflow-x-hidden"
        >
          {lines.map((line, index) => {
            const colorClass = getLineColorClass(line);

            return (
              <div
                key={`${index}-${line}`}
                className={`min-w-0 overflow-hidden px-2 py-0.5 font-mono text-xs whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${colorClass}`}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default MessageLog;
