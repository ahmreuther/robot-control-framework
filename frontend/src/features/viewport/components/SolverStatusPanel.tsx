import { SOLVE_STATUS_LABELS } from "../model/solverConfig";

export interface SolverStatusSnapshot {
  constraintMode: "pose" | "position";
  converged: boolean;
  statuses: number[];
  translationError: number;
  rotationError: number;
  targetPosition: [number, number, number];
  toolPosition: [number, number, number];
}

interface SolverStatusPanelProps {
  status: SolverStatusSnapshot | null;
  movedDistance?: number;
}

export default function SolverStatusPanel({
  status,
  movedDistance,
}: SolverStatusPanelProps) {
  if (!status) {
    return null;
  }

  const primaryStatus =
    status.statuses.length > 0
      ? (SOLVE_STATUS_LABELS[status.statuses[0]] ??
        `Status ${status.statuses[0]}`)
      : status.converged
        ? "Converged"
        : "Unknown";
  return (
    <div className="pointer-events-none inline-block panel text-xs font-mono text-[rgb(var(--fg))] shadow-md">
      <div className="flex flex-col gap-0.5 px-2 py-1">
        <span>
          <span className="font-semibold text-[rgb(var(--fg))]">Status:</span>{" "}
          <span
            className={status.converged ? "text-emerald-300" : "text-amber-200"}
          >
            {primaryStatus}
          </span>
        </span>
        {typeof movedDistance === "number" && movedDistance > 0 ? (
          <span>
            <span className="font-semibold text-[rgb(var(--fg))]">Moved:</span>{" "}
            <span className="text-[rgb(var(--brand))]">
              {movedDistance.toFixed(3)} m
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
