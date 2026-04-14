import { useCallback, useEffect, useMemo, useState } from 'react';

import { useLoading } from '../../../app/contexts/LoadingContext';
import { fetchAllMethods } from '../model/addressSpaceApi';
import type { UaNode } from '../model/types';

interface QuickActionsPanelProps {
  opcUaUrl: string | null;
  openMethodDialog: (node: UaNode) => void;
}

// Session-level cache to survive component remounts when switching servers/views.
const quickActionsMethodsCache: Record<string, UaNode[]> = {};
const quickActionsFilterCache: Record<string, string> = {};

export const QuickActionsPanel = ({ opcUaUrl, openMethodDialog }: QuickActionsPanelProps) => {
  const [methodsByUrl, setMethodsByUrl] =
    useState<Record<string, UaNode[]>>(quickActionsMethodsCache);
  const [filterByUrl, setFilterByUrl] = useState<Record<string, string>>(quickActionsFilterCache);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { executeWithLoading } = useLoading();
  const urlKey = opcUaUrl ?? '__no_url__';
  const methods = useMemo(() => methodsByUrl[urlKey] ?? [], [methodsByUrl, urlKey]);
  const filter = filterByUrl[urlKey] ?? '';
  const hasCachedMethods = urlKey in methodsByUrl || urlKey in quickActionsMethodsCache;

  const setFilter = (value: string) => {
    quickActionsFilterCache[urlKey] = value;
    setFilterByUrl((prev) => ({ ...prev, [urlKey]: value }));
  };

  const loadMethods = useCallback(async () => {
    if (!opcUaUrl) {
      setError(null);
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
      quickActionsMethodsCache[urlKey] = result ?? [];
      setMethodsByUrl((prev) => ({ ...prev, [urlKey]: result ?? [] }));
    } catch (err: unknown) {
      quickActionsMethodsCache[urlKey] = [];
      setMethodsByUrl((prev) => ({ ...prev, [urlKey]: [] }));
      setError(err instanceof Error ? err.message : 'Failed to load methods');
    } finally {
      setIsLoading(false);
    }
  }, [opcUaUrl, executeWithLoading, urlKey]);

  useEffect(() => {
    if (!opcUaUrl) return;
    if (hasCachedMethods) return;
    void loadMethods();
  }, [opcUaUrl, hasCachedMethods, loadMethods]);

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
        <button onClick={() => void loadMethods()} className="button-ghost">
          ↻
        </button>
      </header>
      <div className="panel-body">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter methods by name or NodeId"
          className="input-ghost w-full text-left"
        />
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
