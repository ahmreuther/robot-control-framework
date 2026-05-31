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

export const DEFAULT_SOLVER_CONFIG: SolverConfig = {
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

export const SOLVE_STATUS_LABELS: Record<number, string> = {
  0: "Converged",
  1: "Stalled",
  2: "Diverged",
  3: "Timeout",
};
