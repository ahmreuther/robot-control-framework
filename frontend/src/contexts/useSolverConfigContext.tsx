import { createContext, useContext, useState, type ReactNode } from 'react';

export interface SolverConfig {
  useSVD: boolean;
  maxIterations: number;
  stallThreshold: number;
  dampingFactor: number;
  divergeThreshold: number;
  restPoseFactor: number;
  translationConvergeThreshold: number;
  rotationConvergeThreshold: number;
  translationFactor: number;
  rotationFactor: number;
  translationStep: number;
  rotationStep: number;
  translationErrorClamp: number;
  rotationErrorClamp: number;
}

interface SolverConfigContextType {
  config: SolverConfig;
  updateConfig: (updates: Partial<SolverConfig>) => void;
  resetConfig: () => void;
}

const DEFAULT_CONFIG: SolverConfig = {
  useSVD: false,
  maxIterations: 5,
  stallThreshold: 1e-4,
  dampingFactor: 0.001,
  divergeThreshold: 0.01,
  restPoseFactor: 0.01,
  translationConvergeThreshold: 1e-3,
  rotationConvergeThreshold: 1e-5,
  translationFactor: 1,
  rotationFactor: 1,
  translationStep: 1e-3,
  rotationStep: 1e-3,
  translationErrorClamp: 0.1,
  rotationErrorClamp: 0.1,
};

const SolverConfigContext = createContext<SolverConfigContextType | undefined>(undefined);

export function SolverConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SolverConfig>(DEFAULT_CONFIG);

  const updateConfig = (updates: Partial<SolverConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG);
  };

  return (
    <SolverConfigContext.Provider value={{ config, updateConfig, resetConfig }}>
      {children}
    </SolverConfigContext.Provider>
  );
}

export function useSolverConfig() {
  const context = useContext(SolverConfigContext);
  if (!context) {
    throw new Error('useSolverConfig must be used within a SolverConfigProvider');
  }
  return context;
}
