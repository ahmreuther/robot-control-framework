import { LazyLog, ScrollFollow } from "@melloware/react-logviewer";
import { useContext } from "react";
import { LogContext } from "../../../contexts/LogContext";
import { useMemo, useState } from "react";

export function MessageLog() {

  const { logs, setLogs } = useContext(LogContext);

  function addManual() {
      setLogs(prev=> prev + "new log line\n");
  }
  
  function clearLog(){
      setLogs("Cleared\n")
  }

  const [filter, setFilter] = useState("");

  const filteredLogs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return logs;

    return logs
      .split("\n")
      .filter((line) => line.toLowerCase().includes(q))
      .join("\n");
  }, [logs, filter]);

  return (
    <div className="flex flex-col gap-3 p-4 bg-black bg-opacity-70 rounded border border-white/20 h-full">
      <div className="font-bold text-sm uppercase tracking-wide text-white/90">
        Message Log
      </div>

      {/* Controls + Filter */}
      <div className="flex gap-2 items-center shrink-0">
        <button
          onClick={addManual}
          className="px-3 py-1 text-xs bg-white/10 text-white rounded hover:bg-white/20 transition-colors"
        >
          Test Log
        </button>

        <button
          onClick={clearLog}
          className="px-3 py-1 text-xs bg-white/10 text-white rounded hover:bg-white/20 transition-colors"
        >
          Clear
        </button>

        <div className="ml-auto flex items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-56 px-2 py-1 text-xs rounded bg-white/10 text-white placeholder-white/40 border border-white/10 focus:outline-none focus:border-white/30"
          />

          {filter.length > 0 && (
            <button
              onClick={() => setFilter("")}
              className="px-2 py-1 text-xs bg-white/10 text-white rounded hover:bg-white/20 transition-colors"
              title="Clear filter"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* FLEXIBLE LOG AREA */}
      <div className="flex-1 min-h-0">
        <LazyLog
          extraLines={1}
          selectableLines
          text={filteredLogs}
        />
      </div>
    </div>
  );
}
export default MessageLog;