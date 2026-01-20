// API functions for OPC UA Address Space - JSON Sending/Receiving

import { UaNode, REST_BACKEND_BASE } from "./types";

/**
 * Fetches children of a node from the backend
 * GET /opcua/browse?url=...&node_id=...
 * Returns JSON: { children: UaNode[] }
 */
export const fetchChildren = async (opcUaUrl: string, nodeId: string): Promise<UaNode[]> => {
  const encodedUrl = encodeURIComponent(opcUaUrl);
  const encodedNodeId = encodeURIComponent(nodeId);
  
  const res = await fetch(
    `${REST_BACKEND_BASE}/opcua/browse?url=${encodedUrl}&node_id=${encodedNodeId}`
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "<no-body>");
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }

  // JSON Response: { children: [...] }
  const data = await res.json();
  const children = (data?.children ?? []) as UaNode[];

  // Normalize fields
  return children.map((c) => ({
    nodeId: c.nodeId,
    displayName: c.displayName ?? c.browseName ?? c.nodeId,
    browseName: c.browseName,
    nodeClass: c.nodeClass ?? "Unknown",
    children: c.children ?? undefined,
    loaded: false,
    expanded: false,
    loading: false,
  }));
};

/**
 * Fetches the value of a node (for subscriptions polling)
 * GET /node_value?url=...&nodeid=...
 * Returns JSON: { value: ... }
 */
export const fetchNodeValue = async (opcUaUrl: string, nodeId: string): Promise<any> => {
  const encodedUrl = encodeURIComponent(opcUaUrl);
  const encodedNodeId = encodeURIComponent(nodeId);

  const res = await fetch(
    `${REST_BACKEND_BASE}/node_value?url=${encodedUrl}&nodeid=${encodedNodeId}`
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "<no-body>");
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = await res.text();
  }

  // Wenn payload ein Objekt mit value-Feld ist, gib value direkt zurück (kann Array, Objekt, String, Zahl sein)
  if (payload && typeof payload === "object" && "value" in payload) {
    return payload.value;
  }
  // Fallback: gib das Payload direkt zurück
  return payload;
};

// ========== NODE DETAILS (Properties Panel) ==========
export interface NodeDetails {
  nodeId: string;
  browseName: string;
  displayName: string;
  nodeClass: string;
  nodeClassValue: number;
  description?: string | null;
  value?: any;
  dataType?: string | null;
  accessLevel?: any;
  eventNotifier?: number | null;
}

export const fetchNodeDetails = async (opcUaUrl: string, nodeId: string): Promise<NodeDetails> => {
  const encodedUrl = encodeURIComponent(opcUaUrl);
  const encodedNodeId = encodeURIComponent(nodeId);
  
  const res = await fetch(
    `${REST_BACKEND_BASE}/node_details?url=${encodedUrl}&node_id=${encodedNodeId}`
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "<no-body>");
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }

  return await res.json();
};

// ========== REFERENCES ==========
export interface NodeReference {
  ReferenceType: string;
  NodeId: string;
  BrowseName: string;
  TypeDefinition: string;
}

export const fetchReferences = async (opcUaUrl: string, nodeId: string): Promise<NodeReference[]> => {
  const encodedUrl = encodeURIComponent(opcUaUrl);
  const encodedNodeId = encodeURIComponent(nodeId);
  
  const res = await fetch(
    `${REST_BACKEND_BASE}/references?url=${encodedUrl}&nodeid=${encodedNodeId}`
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "<no-body>");
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data as NodeReference[];
};
