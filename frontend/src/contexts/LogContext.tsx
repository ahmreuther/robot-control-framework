import { createContext, useContext, type PropsWithChildren  } from "react";

type LogContextType = {
  logs: string;
  setLogs: React.Dispatch<React.SetStateAction<string>>;
};


export const LogContext = createContext<LogContextType>({
  logs: null,
  setLogs: () => {},
});

export type LogProviderProps = PropsWithChildren<{
  readonly logs: string | null;
  readonly setlogs: React.Dispatch<React.SetStateAction<string>>
}>;

export function LogProvider(props: LogProviderProps) {
  return(
    <LogContext.Provider value={{ logs: props.logs, setLogs: props.setlogs }}>
          {props.children}
        </LogContext.Provider>
  );
}

export function useLogContext(){
  const context = useContext(LogContext);
    if (!context) {
      throw new Error("useLogContext must be used within a LogProvider");
    }
    return context;
}
