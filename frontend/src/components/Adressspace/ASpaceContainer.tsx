// ASpaceContainer.tsx - Main container component (Bare Minimum)
// This will later orchestrate all sub-components

import React, { useState } from "react";
import { useUrlContext } from "../UrlContext";
import { ASpaceBody } from "./ASpaceBody";
import { UaNode, nodeClassToNumericString } from "./";

export const ASpaceContainer: React.FC = () => {
  const { url: opcUaUrl } = useUrlContext();
  const [isOpen, setIsOpen] = useState(true);
  const [selectedNode, setSelectedNode] = useState<UaNode | null>(null);

  const handleNodeSelect = (node: UaNode) => {
    setSelectedNode(node);
    console.log("[ASpaceContainer] Selected node:", node.nodeId, node);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: "1rem",
        right: "1rem",
        width: "500px",
        maxHeight: "80vh",
        zIndex: 9999,
        border: "1px solid #444",
        borderRadius: 8,
        overflow: "hidden",
        background: "#1b1b1b",
        boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#111",
          padding: "8px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <strong style={{ color: "#fff" }}>OPC UA Address Space</strong>
          <div style={{ fontSize: 11, color: "#888" }}>URL: {opcUaUrl || "not connected"}</div>
        </div>
        <button onClick={() => setIsOpen(!isOpen)}>{isOpen ? "×" : "Open"}</button>
      </div>

      {/* Body - Tree */}
      {isOpen && (
        <div style={{ padding: "8px 12px", maxHeight: "calc(80vh - 60px)", overflow: "auto" }}>
          <ASpaceBody opcUaUrl={opcUaUrl} onNodeSelect={handleNodeSelect} />

          {/* Selected Node Info (minimal) */}
          {selectedNode && (
            <div style={{ marginTop: 12, padding: 8, background: "#222", borderRadius: 4, color: "#fff" }}>
              <div style={{ fontSize: 12, color: "#888" }}>Selected:</div>
              <div>{selectedNode.displayName}</div>
              <div style={{ fontSize: 11, color: "#666" }}>{selectedNode.nodeId}</div>
              <div style={{ fontSize: 11, color: "#666" }}>Class: {selectedNode.nodeClass}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ASpaceContainer;
