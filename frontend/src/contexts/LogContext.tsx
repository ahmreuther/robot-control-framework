import { createContext, type Dispatch, type PropsWithChildren, type SetStateAction, useContext, useState } from 'react';

interface LogContextType {
  logs: string;
  setLogs: Dispatch<SetStateAction<string>>;
}

export const LogContext = createContext<LogContextType | undefined>(undefined);

export type LogProviderProps = PropsWithChildren<{
  initialLogs?: string;
}>;

export function LogProvider({ children, initialLogs = '' }: LogProviderProps) {
  const [logs, setLogs] = useState(initialLogs);

  return <LogContext.Provider value={{ logs, setLogs }}>{children}</LogContext.Provider>;
}

export function useLogContext() {
  const context = useContext(LogContext);
  if (!context) {
    throw new Error('useLogContext must be used within a LogProvider');
  }
  return context;
}
