import { createContext, useContext, useState, type ReactNode } from "react";

import {
  DEFAULT_SOLVER_CONFIG,
  type SolverConfig,
} from "../model/solverConfig";

interface SolverConfigContextValue {
  config: SolverConfig;
  updateConfig: (updates: Partial<SolverConfig>) => void;
  resetConfig: () => void;
}

const SolverConfigContext = createContext<SolverConfigContextValue | undefined>(
  undefined,
);

export function SolverConfigProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [config, setConfig] = useState<SolverConfig>(DEFAULT_SOLVER_CONFIG);

  return (
    <SolverConfigContext.Provider
      value={{
        config,
        updateConfig(updates) {
          setConfig((current) => ({ ...current, ...updates }));
        },
        resetConfig() {
          setConfig(DEFAULT_SOLVER_CONFIG);
        },
      }}
    >
      {children}
    </SolverConfigContext.Provider>
  );
}

export function useSolverConfig() {
  const context = useContext(SolverConfigContext);
  if (!context) {
    throw new Error("useSolverConfig must be used within a SolverConfigProvider");
  }
  return context;
}
