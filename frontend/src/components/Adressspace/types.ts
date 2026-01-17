// Shared types for Address Space components

export type UaNode = {
  nodeId: string;
  displayName: string;
  browseName?: string;
  nodeClass: string; // "Object", "Variable", "Method"
  children?: UaNode[];
  loaded?: boolean;
  expanded?: boolean;
  loading?: boolean;
};

export type SelectedNodeInfo = {
  nodeId: string;
  attributes: Record<string, string>;
};

// Backend configuration
export const REST_BACKEND_BASE = "http://127.0.0.1:8000";
