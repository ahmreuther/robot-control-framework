import { useState, useMemo } from "react";
import { SOLVE_STATUS } from "./Robot";

interface SolverStatusProps {
  solveStatuses: number[];
}

export function SolverStatus({ solveStatuses }: SolverStatusProps) {

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
        <div className="text-white pointer-events-none">
            <span className="font-sans text-sm">{solveStatusText}</span>
        </div>
        );
    }