import React, { createContext, useContext, type PropsWithChildren } from "react";

type LogContextType = {
  logs: string;
  setLogs: React.Dispatch<React.SetStateAction<string>>;
};

export const LogContext = createContext<LogContextType>({
  logs: "",
  setLogs: () => {},
});

export type LogProviderProps = PropsWithChildren<{
  logs: string;
  setLogs: React.Dispatch<React.SetStateAction<string>>;
}>;

export function LogProvider({ logs, setLogs, children }: LogProviderProps) {
  return (
    <LogContext.Provider value={{ logs, setLogs }}>
      {children}
    </LogContext.Provider>
  );
}

export function useLogContext() {
  return useContext(LogContext);
}
