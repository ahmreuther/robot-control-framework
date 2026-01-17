// Tree utility functions

import { UaNode } from "./types";

/**
 * Recursively updates a node by ID in the tree
 */
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

/**
 * Finds a node by ID in the tree
 */
export const findNodeById = (root: UaNode, nodeId: string): UaNode | null => {
  if (root.nodeId === nodeId) return root;
  for (const ch of root.children ?? []) {
    const found = findNodeById(ch, nodeId);
    if (found) return found;
  }
  return null;
};

/**
 * Checks if a node is likely expandable (has potential children)
 */
export const isLikelyExpandable = (node: UaNode): boolean => {
  const cls = (node.nodeClass ?? "").toLowerCase();
  return cls === "object" || cls === "variable";
};
