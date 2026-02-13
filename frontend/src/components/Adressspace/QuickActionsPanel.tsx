import { useCallback, useEffect, useMemo, useState } from 'react';

import { useLoading } from '../../contexts/LoadingContext';
import { fetchAllMethods } from './api';
import type { UaNode } from './types';

interface QuickActionsPanelProps {
  opcUaUrl: string;
  openMethodDialog: (node: UaNode) => void;
}

export const QuickActionsPanel = ({ opcUaUrl, openMethodDialog }: QuickActionsPanelProps) => {
  const [methods, setMethods] = useState<UaNode[]>([]);
  const [filter, setFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { executeWithLoading } = useLoading();

  const loadMethods = useCallback(async () => {
    if (!opcUaUrl) {
      setMethods([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await executeWithLoading(
        `Loading methods from ${opcUaUrl}`,
        () => fetchAllMethods(opcUaUrl),
        {
          errorMessage: `Failed to load methods from ${opcUaUrl}`,
        },
      );
      setMethods(result ?? []);
    } catch (err: any) {
      setMethods([]);
      setError(err?.message || 'Failed to load methods');
    } finally {
      setIsLoading(false);
    }
  }, [opcUaUrl, executeWithLoading]);

  useEffect(() => {
    loadMethods();
  }, [loadMethods]);

  const filteredMethods = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return methods;

    return methods.filter((m) => {
      const name = (m.displayName ?? '').toLowerCase();
      const browse = (m.browseName ?? '').toLowerCase();
      const id = (m.nodeId ?? '').toLowerCase();
      return name.includes(q) || browse.includes(q) || id.includes(q);
    });
  }, [methods, filter]);

  return (
    <div className="panel">
      <header className="panel-header">
        <div className="panel-title flex">Quick Actions</div>
        <button onClick={loadMethods} className="button-ghost">
          ↻
        </button>
      </header>
      <div className="panel-body">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter methods by name or NodeId"
          className="input-ghost w-full text-left mb-2"
        />
        {error && <div className="cell-muted mb-2">{error}</div>}
      </div>
      <table className="panel-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>NodeId</th>
            <th></th>
          </tr>
        </thead>
        {isLoading && (
          <tbody>
            <tr>
              <td colSpan={3} className="text-center cell-muted">
                Loading methods...
              </td>
            </tr>
          </tbody>
        )}
        {!isLoading && filteredMethods.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={3} className="text-center cell-muted">
                No methods found
              </td>
            </tr>
          </tbody>
        )}
        {!isLoading && filteredMethods.length > 0 && (
          <tbody>
            {filteredMethods.map((m) => (
              <tr key={m.nodeId}>
                <td className="cell-muted">{m.displayName}</td>
                <td className="cell-mono" title={m.nodeId}>
                  {m.nodeId}
                </td>
                <td className="text-right">
                  <button onClick={() => openMethodDialog(m)} className="button-ghost">
                    Call
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
};
