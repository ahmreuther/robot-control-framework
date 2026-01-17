// ASpaceBody.tsx - Tree loading and rendering component (Bare Minimum)

import React, { useEffect, useState } from "react";
import { UaNode } from "./types";
import { fetchChildren } from "./api";
import { updateNodeById, findNodeById, isLikelyExpandable } from "./treeUtils";

type ASpaceBodyProps = {
  opcUaUrl: string;
  onNodeSelect?: (node: UaNode) => void;
};

const INDENT_PER_LEVEL_PX = 20;

export const ASpaceBody: React.FC<ASpaceBodyProps> = ({ opcUaUrl, onNodeSelect }) => {
  const [root, setRoot] = useState<UaNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ========== LOAD ROOT (JSON GET) ==========
  useEffect(() => {
    if (!opcUaUrl) return;

    const loadRoot = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch children of RootFolder (i=84)
        const children = await fetchChildren(opcUaUrl, "i=84");

        setRoot({
          nodeId: "i=84",
          displayName: "Root",
          browseName: "0:RootFolder",
          nodeClass: "Object",
          children,
          loaded: true,
          expanded: true,
          loading: false,
        });
      } catch (e: any) {
        console.error("[ASpaceBody] Root load error:", e);
        setError(e?.message ?? "Unknown error");
        setRoot(null);
      } finally {
        setLoading(false);
      }
    };

    loadRoot();
  }, [opcUaUrl]);

  // ========== TOGGLE NODE (EXPAND/COLLAPSE + LAZY LOAD) ==========
  const toggleNode = async (nodeId: string) => {
    if (!root) return;

    // Toggle expanded state
    setRoot((prev) => {
      if (!prev) return prev;
      return updateNodeById(prev, nodeId, (n) => ({ ...n, expanded: !n.expanded }));
    });

    // Check if we need to load children
    setRoot((prev) => {
      if (!prev) return prev;
      const node = findNodeById(prev, nodeId);
      if (!node || !node.expanded || node.loaded || node.loading) return prev;
      return updateNodeById(prev, nodeId, (n) => ({ ...n, loading: true }));
    });

    try {
      // Fetch children (JSON GET)
      const children = await fetchChildren(opcUaUrl, nodeId);

      setRoot((prev) => {
        if (!prev) return prev;
        return updateNodeById(prev, nodeId, (n) => ({
          ...n,
          children,
          loaded: true,
          loading: false,
        }));
      });
    } catch (e) {
      console.error("[ASpaceBody] toggleNode error:", e);
      setRoot((prev) => {
        if (!prev) return prev;
        return updateNodeById(prev, nodeId, (n) => ({
          ...n,
          loading: false,
          loaded: true,
          children: n.children ?? [],
        }));
      });
    }
  };

  // ========== RENDER NODE ==========
  const renderNode = (node: UaNode, level: number) => {
    const expandable = isLikelyExpandable(node);
    const hasChildren = (node.children?.length ?? 0) > 0;
    const showArrow = node.loading || (node.loaded ? hasChildren : expandable);
    const arrowChar = node.loading ? "…" : node.expanded ? "▾" : "▸";

    return (
      <div key={node.nodeId}>
        <div
          style={{
            marginLeft: level * INDENT_PER_LEVEL_PX,
            display: "flex",
            gap: 6,
            alignItems: "center",
            cursor: showArrow ? "pointer" : "default",
            padding: "3px 6px",
            borderRadius: 4,
            backgroundColor: "transparent",
          }}
          className="hover:bg-white/5"
          onClick={() => showArrow && toggleNode(node.nodeId)}
          onContextMenu={(e) => {
            e.preventDefault();
            onNodeSelect?.(node);
          }}
          title={node.nodeId}
        >
          {/* Arrow only for expandable nodes, nothing for leaf nodes */}
          {showArrow ? (
            <span style={{ width: 16, color: "#888", fontFamily: "monospace" }}>
              {arrowChar}
            </span>
          ) : (
            <span style={{ width: 16 }} /> 
          )}
          <span style={{ color: "#fff" }}>{node.displayName}</span>
          <span style={{ color: "#555", fontSize: 11 }}>({node.nodeClass})</span>
        </div>

        {node.expanded && node.children?.map((c) => renderNode(c, level + 1))}

        {node.expanded && node.loaded && !hasChildren && (
          <div style={{ marginLeft: (level + 1) * INDENT_PER_LEVEL_PX + 16, color: "#555", fontSize: 11, padding: "2px 0" }}>
            (empty)
          </div>
        )}
      </div>
    );
  };

  // ========== RENDER ==========
  if (!opcUaUrl) {
    return <div style={{ color: "#aaa" }}>Please connect to an OPC UA server first.</div>;
  }

  if (loading) {
    return <div style={{ color: "#aaa" }}>Loading Address Space from {opcUaUrl}…</div>;
  }

  if (error) {
    return <div style={{ color: "#f66" }}>Error: {error}</div>;
  }

  if (!root) {
    return <div style={{ color: "#888" }}>No data loaded.</div>;
  }

  return <div style={{ fontFamily: "system-ui, sans-serif" }}>{renderNode(root, 0)}</div>;
};

export default ASpaceBody;
