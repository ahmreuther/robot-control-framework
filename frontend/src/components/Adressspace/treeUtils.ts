import { UaNode } from "./types";

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