// ASpaceBody.tsx - Tree loading and rendering component (Performance Optimized)

import React, { useEffect, useState, useCallback, memo, useRef } from "react";
import { UaNode } from "./types";
import { fetchChildren } from "./api";
import { updateNodeById, findNodeById, isLikelyExpandable } from "./treeUtils";

type ASpaceBodyProps = {
  opcUaUrl: string;
  onNodeSelect?: (node: UaNode) => void;
};

const INDENT_PER_LEVEL_PX = 20;
const STORAGE_KEY_EXPANDED = "addressSpace_expandedNodes";

const getNodeClassEmoji = (nodeClass: string): string => {
  switch ((nodeClass ?? "").toLowerCase()) {
    case "object":
      return "📁";
    case "variable":
      return "📊";
    case "method":
      return "💽";
    case "view":
      return "👁️";
    case "objecttype":
      return "📦";
    case "variabletype":
      return "📈";
    case "referencetype":
      return "🔗";
    case "datatype":
      return "🔢";
    default:
      return "📄";
  }
};
// ========== MEMOIZED NODE COMPONENT (prevents unnecessary re-renders) ==========
interface TreeNodeProps {
  node: UaNode;
  level: number;
  onToggle: (nodeId: string) => void;
  onSelect?: (node: UaNode) => void;
}

const TreeNode = memo<TreeNodeProps>(({ node, level, onToggle, onSelect }) => {
  const expandable = isLikelyExpandable(node);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const showArrow = node.loading || (node.loaded ? hasChildren : expandable);
  const arrowChar = node.loading ? "…" : node.expanded ? "▾" : "▸";

  const handleClick = useCallback(() => {
    if (showArrow) onToggle(node.nodeId);
  }, [showArrow, onToggle, node.nodeId]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onSelect?.(node);
  }, [onSelect, node]);

  return (
    <div>
      <div
        style={{
          marginLeft: level * INDENT_PER_LEVEL_PX,
          display: "flex",
          gap: 6,
          alignItems: "center",
          cursor: showArrow ? "pointer" : "default",
          padding: "3px 6px",
          borderRadius: 4,
        }}
        className="hover:bg-white/5"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={node.nodeId}
      >
        {showArrow ? (
          <span style={{ width: 16, color: "#888", fontFamily: "monospace" }}>
            {arrowChar}
          </span>
        ) : (
          <span style={{ width: 16 }} />
        )}
        <span style={{ fontSize: 14 }}>{getNodeClassEmoji(node.nodeClass)}</span>
        <span style={{ color: "#fff" }}>{node.displayName}</span>
      </div>

      {node.expanded && node.children?.map((c) => (
        <TreeNode
          key={c.nodeId}
          node={c}
          level={level + 1}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}

      {node.expanded && node.loaded && !hasChildren && (
        <div style={{ marginLeft: (level + 1) * INDENT_PER_LEVEL_PX + 16, color: "#555", fontSize: 11, padding: "2px 0" }}>
          (empty)
        </div>
      )}
    </div>
  );
});

TreeNode.displayName = "TreeNode";

// ========== HELPER: Collect expanded node IDs ==========
const collectExpandedIds = (node: UaNode): string[] => {
  const ids: string[] = [];
  if (node.expanded) ids.push(node.nodeId);
  node.children?.forEach(c => ids.push(...collectExpandedIds(c)));
  return ids;
};

// ========== HELPER: Load saved expanded state ==========
const loadExpandedIds = (): Set<string> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_EXPANDED);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
};

// ========== MAIN COMPONENT ==========
export const ASpaceBody: React.FC<ASpaceBodyProps> = ({ opcUaUrl, onNodeSelect }) => {
  const [root, setRoot] = useState<UaNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track expanded nodes for persistence
  const expandedIdsRef = useRef<Set<string>>(loadExpandedIds());

  // ========== SAVE EXPANDED STATE on visibility change (minimize) ==========
  // We save continuously so minimize preserves state, but close handler clears it
  useEffect(() => {
    if (!root) return;
    
    // Save current expanded state
    const ids = collectExpandedIds(root);
    localStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify(ids));
  }, [root]);

  // ========== RECURSIVE LOAD FOR SAVED EXPANDED NODES ==========
  const loadExpandedChildren = useCallback(async (
    nodeId: string,
    savedExpanded: Set<string>
  ): Promise<UaNode[]> => {
    const children = await fetchChildren(opcUaUrl, nodeId);
    
    // For each child that should be expanded, recursively load its children
    const childrenWithState = await Promise.all(
      children.map(async (child) => {
        const shouldExpand = savedExpanded.has(child.nodeId);
        
        if (shouldExpand && isLikelyExpandable(child)) {
          // Recursively load this child's children
          try {
            const grandchildren = await loadExpandedChildren(child.nodeId, savedExpanded);
            return {
              ...child,
              expanded: true,
              loaded: true,
              loading: false,
              children: grandchildren,
            };
          } catch (e) {
            console.warn(`[ASpaceBody] Failed to load children of ${child.nodeId}:`, e);
            return { ...child, expanded: false };
          }
        }
        
        return { ...child, expanded: false };
      })
    );
    
    return childrenWithState;
  }, [opcUaUrl]);

  // ========== LOAD ROOT (JSON GET) ==========
  useEffect(() => {
    if (!opcUaUrl) return;

    const loadRoot = async () => {
      try {
        setLoading(true);
        setError(null);

        const savedExpanded = expandedIdsRef.current;
        
        // Load root children with recursive expansion for saved state
        const children = await loadExpandedChildren("i=84", savedExpanded);

        setRoot({
          nodeId: "i=84",
          displayName: "Root",
          browseName: "0:RootFolder",
          nodeClass: "Object",
          children,
          loaded: true,
          expanded: savedExpanded.has("i=84") || savedExpanded.size === 0, // Default open if no saved state
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
  }, [opcUaUrl, loadExpandedChildren]);

  // ========== TOGGLE NODE - OPTIMIZED (single state update) ==========
  const toggleNode = useCallback(async (nodeId: string) => {
    if (!root) return;

    // Find node to check current state
    const node = findNodeById(root, nodeId);
    if (!node) return;

    const willExpand = !node.expanded;
    const needsLoad = willExpand && !node.loaded && !node.loading;

    if (needsLoad) {
      // Set loading state and expand in ONE update
      setRoot((prev) => {
        if (!prev) return prev;
        return updateNodeById(prev, nodeId, (n) => ({
          ...n,
          expanded: true,
          loading: true,
        }));
      });

      try {
        // Load children with recursive expansion for saved state
        const savedExpanded = expandedIdsRef.current;
        const childrenWithState = await loadExpandedChildren(nodeId, savedExpanded);

        setRoot((prev) => {
          if (!prev) return prev;
          return updateNodeById(prev, nodeId, (n) => ({
            ...n,
            children: childrenWithState,
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
    } else {
      // Just toggle expanded (already loaded or collapsing)
      setRoot((prev) => {
        if (!prev) return prev;
        return updateNodeById(prev, nodeId, (n) => ({ ...n, expanded: !n.expanded }));
      });
    }
  }, [root, opcUaUrl]);

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

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <TreeNode node={root} level={0} onToggle={toggleNode} onSelect={onNodeSelect} />
    </div>
  );
};

export default ASpaceBody;
