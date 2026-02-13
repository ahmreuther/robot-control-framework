import { useContext, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';

import { LogContext } from '../../../contexts/LogContext';

export function MessageLog() {
  const { logs, setLogs } = useContext(LogContext);

  const [filter, setFilter] = useState('');

  function addManual() {
    setLogs((prev) => prev + `new log line ${new Date().toLocaleTimeString()}\n`);
  }

  function clearLog() {
    setLogs('Cleared\n');
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
            itemContent={(index, line) => (
              <div className="px-2 py-0.5 font-mono text-xs text-white/80 whitespace-pre-wrap break-words">
                {line}
              </div>
            )}
          />
        </div>
      </div>
    </section>
  );
}

export default MessageLog;
