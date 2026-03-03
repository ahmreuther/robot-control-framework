import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { useServersContext } from './ServersContext';

interface LogContextType {
  logs: string;
  setLogs: Dispatch<SetStateAction<string>>;
  appendLog: (line: string, serverId?: number | null) => void;
  clearLogs: (serverId?: number | null) => void;
}

export const LogContext = createContext<LogContextType | undefined>(undefined);

export type LogProviderProps = PropsWithChildren<{
  initialLogs?: string;
}>;

const GLOBAL_SCOPE = 'global';

const getScopeKey = (serverId: number | null | undefined) =>
  serverId === null || serverId === undefined ? GLOBAL_SCOPE : `server:${serverId}`;

export function LogProvider({ children, initialLogs = '' }: LogProviderProps) {
  const { activeASpaceServerId, activeRuntimeServerId } = useServersContext();
  const [logsByScope, setLogsByScope] = useState<Record<string, string>>({
    [GLOBAL_SCOPE]: initialLogs,
  });

  const activeScopeKey = getScopeKey(activeRuntimeServerId ?? activeASpaceServerId);
  const logs = logsByScope[activeScopeKey] ?? '';

  const setLogs: Dispatch<SetStateAction<string>> = useCallback(
    (value) => {
      setLogsByScope((prev) => {
        const prevScoped = prev[activeScopeKey] ?? '';
        const nextScoped = typeof value === 'function' ? value(prevScoped) : value;
        return { ...prev, [activeScopeKey]: nextScoped };
      });
    },
    [activeScopeKey],
  );

  const appendLog = useCallback(
    (line: string, serverId?: number | null) => {
      const scopeKey = getScopeKey(serverId ?? activeRuntimeServerId ?? activeASpaceServerId);
      setLogsByScope((prev) => ({
        ...prev,
        [scopeKey]: `${prev[scopeKey] ?? ''}${line}`,
      }));
    },
    [activeASpaceServerId, activeRuntimeServerId],
  );

  const clearLogs = useCallback(
    (serverId?: number | null) => {
      const scopeKey = getScopeKey(serverId ?? activeRuntimeServerId ?? activeASpaceServerId);
      setLogsByScope((prev) => ({
        ...prev,
        [scopeKey]: '',
      }));
    },
    [activeASpaceServerId, activeRuntimeServerId],
  );

  const value = useMemo(
    () => ({
      logs,
      setLogs,
      appendLog,
      clearLogs,
    }),
    [logs, setLogs, appendLog, clearLogs],
  );

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}

export function useLogContext() {
  const context = useContext(LogContext);
  if (!context) {
    throw new Error('useLogContext must be used within a LogProvider');
  }
  return context;
}
