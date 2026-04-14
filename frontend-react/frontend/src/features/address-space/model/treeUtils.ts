import type { UaNode, UaNodeState, UaStore } from './types';

export const getNodeClassEmoji = (nodeClass: string): string => {
  switch ((nodeClass ?? '').toLowerCase()) {
    case 'object':
      return '🔴';
    case 'variable':
      return '🔢';
    case 'method':
      return '(x)';
    case 'view':
      return '🧱';
    case 'objecttype':
      return '🔢📏';
    case 'variabletype':
      return '🔗';
    case 'referencetype':
      return '💾';
    case 'datatype':
      return '👁️';
    default:
      return '🚫';
  }
};

export const loadExpandedIds = (storageKey: string): Set<string> => {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
};

export function upsertNodes(store: UaStore, nodes: UaNode[]): UaStore {
  const nextNodes = new Map(store.nodes);
  for (const n of nodes) nextNodes.set(n.nodeId, n);
  return { ...store, nodes: nextNodes };
}

export function setChildren(store: UaStore, parentId: string, childIds: string[]): UaStore {
  const nextChildren = new Map(store.childrenById);
  nextChildren.set(parentId, childIds);
  return { ...store, childrenById: nextChildren };
}

export function setNodeState(store: UaStore, nodeId: string, patch: Partial<UaNodeState>): UaStore {
  const nextState = new Map(store.stateById);
  const prev = nextState.get(nodeId) ?? {};
  nextState.set(nodeId, { ...prev, ...patch });
  return { ...store, stateById: nextState };
}
