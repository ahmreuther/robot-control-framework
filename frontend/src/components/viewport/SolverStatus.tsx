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
        style={{
          background: 'rgba(34,34,34,0.85)',
          color: '#fff',
          padding: '2px 8px',
          borderRadius: '8px',
          fontSize: '1em',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          border: '1px solid #444',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          pointerEvents: 'none',
          display: 'inline-block',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span><b>Status:</b> {solveStatusText}</span>
          {typeof movedDistance === 'number' && movedDistance > 0 && (
            <span style={{fontWeight: 600 }}>
              <b>Moved:</b> {movedDistance.toFixed(3)} m
            </span>
          )}
        </div>
      </div>
    );
  }