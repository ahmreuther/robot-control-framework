// NodeDetailsPanel.tsx - Zeigt Properties + References eines Nodes

import React, { useState, useEffect } from "react";
import { UaNode } from "../types";
import { fetchNodeDetails, fetchReferences, NodeDetails, NodeReference } from "../api";

type Tab = "properties" | "references";

type NodeDetailsPanelProps = {
  node: UaNode | null;
  opcUaUrl: string;
};

export const NodeDetailsPanel: React.FC<NodeDetailsPanelProps> = ({ node, opcUaUrl }) => {
  const [tab, setTab] = useState<Tab>("properties");
  const [details, setDetails] = useState<NodeDetails | null>(null);
  const [references, setReferences] = useState<NodeReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!node || !opcUaUrl) {
      setDetails(null);
      setReferences([]);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [d, r] = await Promise.all([
          fetchNodeDetails(opcUaUrl, node.nodeId),
          fetchReferences(opcUaUrl, node.nodeId),
        ]);
        setDetails(d);
        setReferences(r);
      } catch (e: any) {
        setError(e?.message ?? "Error loading details");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [node?.nodeId, opcUaUrl]);

  if (!node) {
    return (
      <div style={{ color: "#666", fontSize: 12, padding: 8 }}>
        Rechtsklick auf einen Node für Details
      </div>
    );
  }

  const tabStyle = (active: boolean) => ({
    padding: "6px 12px",
    background: active ? "#333" : "transparent",
    border: "none",
    color: active ? "#fff" : "#888",
    cursor: "pointer",
    fontSize: 12,
    borderRadius: "4px 4px 0 0",
  });

  return (
    <div style={{ borderTop: "1px solid #333", marginTop: 12 }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, background: "#1a1a1a", padding: "4px 4px 0" }}>
        <button style={tabStyle(tab === "properties")} onClick={() => setTab("properties")}>
          Properties
        </button>
        <button style={tabStyle(tab === "references")} onClick={() => setTab("references")}>
          References ({references.length})
        </button>
      </div>

      {/* Content */}
      <div style={{ background: "#222", padding: 8, maxHeight: 200, overflowY: "auto" }}>
        {loading && <div style={{ color: "#888" }}>Loading...</div>}
        {error && <div style={{ color: "#f66" }}>{error}</div>}

        {!loading && !error && tab === "properties" && details && (
          <PropertiesView details={details} />
        )}

        {!loading && !error && tab === "references" && (
          <ReferencesView references={references} />
        )}
      </div>
    </div>
  );
};

// ========== Properties View ==========
const PropertiesView: React.FC<{ details: NodeDetails }> = ({ details }) => {
  const rows: [string, any][] = [
    ["Node ID", details.nodeId],
    ["Browse Name", details.browseName],
    ["Display Name", details.displayName],
    ["Node Class", `${details.nodeClass} (${details.nodeClassValue})`],
    ["Description", details.description ?? "—"],
  ];

  if (details.value !== undefined) {
    rows.push(["Value", JSON.stringify(details.value)]);
  }
  if (details.dataType) {
    rows.push(["Data Type", details.dataType]);
  }
  if (details.eventNotifier !== undefined && details.eventNotifier !== null) {
    rows.push(["Event Notifier", details.eventNotifier]);
  }

  return (
    <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={{ color: "#888", padding: "3px 8px 3px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>
              {label}
            </td>
            <td style={{ color: "#fff", padding: "3px 0", wordBreak: "break-all" }}>
              {String(value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// ========== References View ==========
const ReferencesView: React.FC<{ references: NodeReference[] }> = ({ references }) => {
  if (references.length === 0) {
    return <div style={{ color: "#666", fontSize: 11 }}>No references</div>;
  }

  return (
    <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "#888", borderBottom: "1px solid #333" }}>
          <th style={{ textAlign: "left", padding: 4 }}>ReferenceType</th>
          <th style={{ textAlign: "left", padding: 4 }}>NodeId</th>
          <th style={{ textAlign: "left", padding: 4 }}>BrowseName</th>
        </tr>
      </thead>
      <tbody>
        {references.map((ref, i) => (
          <tr key={i} style={{ borderBottom: "1px solid #2a2a2a" }}>
            <td style={{ color: "#aaa", padding: 4 }}>{ref.ReferenceType.split(" ")[0]}</td>
            <td style={{ color: "#4fc3f7", padding: 4, fontFamily: "monospace" }}>{ref.NodeId}</td>
            <td style={{ color: "#fff", padding: 4 }}>{ref.BrowseName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
