import { useState, useMemo } from "react";
import { SOLVE_STATUS } from "./Robot";

interface SolverStatusProps {
  solveStatuses: number[];
  movedDistance?: number;
}

export function SolverStatus({ solveStatuses, movedDistance }: SolverStatusProps) {

      // Lookup map from solver status enum to readable labels
      const statusLookup = useMemo(() => {
        const entries = Object.entries(SOLVE_STATUS) as Array<[keyof typeof SOLVE_STATUS, number]>;
        const lookup: Record<number, string> = {};
        entries.forEach(([label, value]) => {
          lookup[value] = label;
        });
        return lookup;
      }, []);

      const solveStatusText = useMemo(() => {
        return solveStatuses.length
          ? solveStatuses.map((status) => statusLookup[status] ?? `UNKNOWN(${status})`).join(", ")
          : "n/a";
      }, [solveStatuses, statusLookup]);
      
    return (
      <div
  className="
    pointer-events-none inline-block
    panel
    text-xs font-mono
    text-[rgb(var(--fg))]
    shadow-md
  "
>
  <div className="flex flex-col px-2 py-1">
    <span>
      <span className="font-semibold text-[rgb(var(--fg))]">Status:</span>{" "}
      <span className="text-[rgb(var(--fg)]">{solveStatusText}</span>
    </span>

    {typeof movedDistance === "number" && movedDistance > 0 && (
      <span className="font-semibold text-[rgb(var(--fg))]">
        Moved:{" "}
        <span className="text-[rgb(var(--brand))]">
          {movedDistance.toFixed(3)} m
        </span>
      </span>
    )}
  </div>
</div>

    );
  }