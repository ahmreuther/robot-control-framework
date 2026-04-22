import { useEffect, useMemo, useRef, useState } from "react";

import type { ApplicationController } from "../../../app/model/applicationController";
import type { WebSocketMessageLogEntry } from "../../../shared/api/websocketClient";

function sanitizeLine(line: string) {
  return line
    .replace(/[✅❌📤📥🔔🔌🚫🔴🟢⚠️]/g, "")
    .replace(/\s{2,}/g, " ")
    .trimStart();
}

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
    l.includes("invalid") ||
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

function formatEntry(entry: WebSocketMessageLogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const messageType = "type" in entry.message ? entry.message.type : "message";

  if (entry.direction === "incoming") {
    return `${time} received ${messageType}: ${JSON.stringify(entry.message)}`;
  }
  if (entry.direction === "queued") {
    return `${time} warning queued ${messageType}: ${JSON.stringify(entry.message)}`;
  }
  return `${time} sent ${messageType}: ${JSON.stringify(entry.message)}`;
}

export function MessageLog({
  controller,
}: {
  controller: ApplicationController;
}) {
  const [logs, setLogs] = useState("");
  const [filter, setFilter] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return controller.onWebSocketMessageLog((entry) => {
      setLogs((current) => `${current}${formatEntry(entry)}\n`);
    });
  }, [controller]);

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
    const arr = logs.split("\n");

    const q = filter.trim().toLowerCase();
    if (!q) return arr;

    return arr.filter((line) => line.toLowerCase().includes(q));
  }, [logs, filter]);

  return (
    <section className="panel flex h-full flex-col">
      <header className="panel-header">
        <div className="panel-title">Message Log</div>
        <div className="flex items-center gap-2">
          <button onClick={clearLog} className="button-ghost ">
            Clear
          </button>
        </div>
      </header>
      <div className="panel-body flex h-full flex-col">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter"
          className="input-ghost w-full text-left mb-2"
        />
        <div ref={scrollRef} className="panel h-full overflow-auto">
          {lines.map((line, index) => {
            const cleanLine = sanitizeLine(line);
            const colorClass = getLineColorClass(cleanLine);

            return (
              <div
                key={`${index}-${cleanLine}`}
                className={`px-2 py-0.5 font-mono text-xs whitespace-pre-wrap break-words ${colorClass}`}
              >
                {cleanLine}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default MessageLog;
