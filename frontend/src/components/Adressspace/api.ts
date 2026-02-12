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

export const fetchAllMethods = async (opcUaUrl: string, startNodeId: string = "i=84"): Promise<UaNode[]> => {
  const methods: UaNode[] = [];
  const visited = new Set<string>();

  const explore = async (nodeId: string): Promise<void> => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    try {
      const children = await fetchChildren(opcUaUrl, nodeId);
      
      for (const child of children) {
        if (child.nodeClass.toLowerCase() === "method") {
          methods.push(child);
        }
        
        
        if (child.nodeClass.toLowerCase() === "object" || child.nodeClass.toLowerCase() === "variable") {
          await explore(child.nodeId);
        }
      }
    } catch (e) {
      console.warn(`[fetchAllMethods] Failed to explore ${nodeId}:`, e);
    }
  };

  await explore(startNodeId);
  
  // Sort lexicographically by displayName
  return methods.sort((a, b) => a.displayName.localeCompare(b.displayName));
};


export const fetchNodeValue = async (opcUaUrl: string, nodeId: string): Promise<any> => {
  const encodedUrl = encodeURIComponent(opcUaUrl);
  const encodedNodeId = encodeURIComponent(nodeId);

  const res = await fetch(
    `${REST_BACKEND_BASE}/node_value?url=${encodedUrl}&nodeid=${encodedNodeId}`
  );

if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  return payload?.value ?? payload;
};

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

if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
};

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

 if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
};
