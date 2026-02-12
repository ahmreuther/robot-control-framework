import { UaNode } from "./types";
import type { TreeDataNode } from "antd";

export const updateNodeById = (
  root: UaNode,
  nodeId: string,
  updater: (n: UaNode) => UaNode
): UaNode => {
  if (root.nodeId === nodeId) return updater(root);

  if (!root.children || root.children.length === 0) return root;

  const newChildren = root.children.map((c) => updateNodeById(c, nodeId, updater));
  const same = newChildren.every((c, i) => c === root.children![i]);
  return same ? root : { ...root, children: newChildren };
};

export const findNodeById = (root: UaNode, nodeId: string): UaNode | null => {
  if (root.nodeId === nodeId) return root;
  for (const ch of root.children ?? []) {
    const found = findNodeById(ch, nodeId);
    if (found) return found;
  }
  return null;
};

export const isLikelyExpandable = (node: UaNode | null): boolean => {
  if (!node) return;
  const cls = (node.nodeClass ?? "").toLowerCase();
  return cls === "object" || cls === "variable";
};

export const getNodeClassEmoji = (nodeClass: string): string => {
  switch ((nodeClass ?? "").toLowerCase()) {
    case "object":
      return "🔴";
    case "variable":
      return "🔢";
    case "method":
      return "(x)";
    case "view":
      return "🧱";
    case "objecttype":
      return "🔢📏";
    case "variabletype":
      return "🔗";
    case "referencetype":
      return "💾";
    case "datatype":
      return "👁️";
    default:
      return "🚫";
  }
};

export const collectExpandedIds = (node: UaNode): string[] => {
  const ids: string[] = [];
  if (node.expanded) ids.push(node.nodeId);
  node.children?.forEach(c => ids.push(...collectExpandedIds(c)));
  return ids;
};

export const loadExpandedIds = (storageKey: string): Set<string> => {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
};