import { createContext, useContext } from "react";

type LogContextType = {
  logs: string;
  setLogs: React.Dispatch<React.SetStateAction<string>>;
};


export const LogContext = createContext<LogContextType>({
  logs: null,
  setLogs: () => {},
});


