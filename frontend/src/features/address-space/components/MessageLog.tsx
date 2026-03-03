import { useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';

import { useLogContext } from '../contexts/LogContext';

function sanitizeLine(line: string) {
  return line
    .replace(/[✅❌📤📥🔔🔌🚫🔴🟢⚠️]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trimStart();
}

function getLineColorClass(line: string) {
  const l = line.toLowerCase();

  if (l.includes(' out ') || l.startsWith('sent')) {
    return 'text-cyan-300';
  }
  if (l.includes('received') || l.includes('result:') || l.includes('connected')) {
    return 'text-emerald-300';
  }
  if (
    l.includes('error') ||
    l.includes('failed') ||
    l.includes('invalid') ||
    l.includes('not ready') ||
    l.includes('no client')
  ) {
    return 'text-rose-300';
  }
  if (l.includes('warning')) {
    return 'text-amber-300';
  }

  return 'text-white/80';
}

export function MessageLog() {
  const { logs, appendLog, clearLogs } = useLogContext();

  const [filter, setFilter] = useState('');

  function addManual() {
    appendLog(`new log line ${new Date().toLocaleTimeString()}\n`);
  }

  function clearLog() {
    clearLogs();
  }

  const lines = useMemo(() => {
    const raw = logs ?? '';
    const arr = raw.split('\n');

    const q = filter.trim().toLowerCase();
    if (!q) return arr;

    return arr.filter((l) => l.toLowerCase().includes(q));
  }, [logs, filter]);

  return (
    <section className="panel flex h-full flex-col ml-2">
      <header className="panel-header">
        <div className="panel-title">Message Log</div>
        <div className="flex items-center gap-2">
          <button onClick={addManual} className="button-ghost ">
            Test Log
          </button>
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
        <div className="panel h-full">
          <Virtuoso
            data={lines}
            followOutput
            style={{ height: '100%' }}
            itemContent={(_, line) => {
              const cleanLine = sanitizeLine(line);
              const colorClass = getLineColorClass(cleanLine);

              return (
                <div
                  className={`px-2 py-0.5 font-mono text-xs whitespace-pre-wrap break-words ${colorClass}`}
                >
                  {cleanLine}
                </div>
              );
            }}
          />
        </div>
      </div>
    </section>
  );
}

export default MessageLog;
