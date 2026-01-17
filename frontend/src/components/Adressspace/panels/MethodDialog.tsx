// MethodDialog.tsx - Modal für Method Calls

import React from "react";
import { UaNode } from "../types";

type MethodDialogProps = {
  isOpen: boolean;
  node: UaNode | null;
  inputsJSON: string;
  result: string | null;
  isLoading: boolean;
  onInputsChange: (json: string) => void;
  onCall: () => void;
  onClose: () => void;
};

export const MethodDialog: React.FC<MethodDialogProps> = ({
  isOpen,
  node,
  inputsJSON,
  result,
  isLoading,
  onInputsChange,
  onCall,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1b1b1b",
          border: "1px solid #444",
          borderRadius: 8,
          padding: "16px",
          minWidth: "400px",
          maxWidth: "600px",
          maxHeight: "80vh",
          overflow: "auto",
          color: "#f5f5f5",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Call Method</h3>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid #333",
              color: "#ccc",
              padding: "4px 8px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* Node Info */}
        {node && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#aaa", fontSize: 12 }}>Method</div>
            <div style={{ color: "#fff", fontSize: 14 }}>{node.displayName}</div>
            <div style={{ color: "#666", fontSize: 11, wordBreak: "break-all" }}>{node.nodeId}</div>
          </div>
        )}

        {/* Input Parameters */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "#ccc", fontSize: 13, marginBottom: 6 }}>
            Input Parameters (JSON)
          </label>
          <div style={{ color: "#888", fontSize: 11, marginBottom: 6 }}>
            Example: {`{"paramName":"value","count":42}`}
          </div>
          <textarea
            value={inputsJSON}
            onChange={(e) => onInputsChange(e.target.value)}
            style={{
              width: "100%",
              minHeight: "100px",
              padding: "8px",
              background: "#121212",
              border: "1px solid #333",
              borderRadius: 4,
              color: "#fff",
              fontSize: 13,
              fontFamily: "monospace",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={onCall}
            disabled={isLoading}
            style={{
              padding: "8px 16px",
              background: isLoading ? "#555" : "#2a7fff",
              border: "none",
              borderRadius: 4,
              color: "#fff",
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            {isLoading ? "Calling..." : "Call Method"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid #444",
              borderRadius: 4,
              color: "#ccc",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>

        {/* Result */}
        {result && (
          <div
            style={{
              padding: "12px",
              background: "#121212",
              border: "1px solid #333",
              borderRadius: 6,
              color: "#fff",
              fontSize: 13,
            }}
          >
            <div style={{ color: "#aaa", fontSize: 12, marginBottom: 6 }}>Result</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
