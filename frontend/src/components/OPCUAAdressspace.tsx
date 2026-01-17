// // OLD FILE - KEPT FOR REFERENCE - NOT USED ANYMORE
// // The new Address Space components are in ./Adressspace/

// import React, { useEffect, useRef, useState } from "react";
// import { useUrlContext } from "./UrlContext";
// import { useSocket } from "../hooks/use-socket";

// type SelectedNodeInfo = {
//   nodeId: string;
//   attributes: Record<string, string>;
// };

// type UaNode = {
//   nodeId: string;
//   displayName: string;
//   browseName?: string;
//   nodeClass: string; // e.g. "Object", "Variable", "Method"
//   children?: UaNode[];
//   loaded?: boolean;    // children were fetched at least once
//   expanded?: boolean;  // UI state
//   loading?: boolean;   // children currently loading
// };

// const REST_BACKEND_BASE = "http://127.0.0.1:8000";
// const INDENT_PER_LEVEL_PX = 10;

// const nodeClassToNumericString = (nodeClass: string): string => {
//   // keep your existing checks working (nodeclass: "1"/"2"/"4")
//   switch ((nodeClass ?? "").toLowerCase()) {
//     case "object":
//       return "1";
//     case "variable":
//       return "2";
//     case "method":
//       return "4";
//     default:
//       return ""; // unknown/other
//   }
// };

// const isLikelyExpandable = (node: UaNode): boolean => {
//   // Objects/Variables often have children/properties; Methods typically not
//   const cls = (node.nodeClass ?? "").toLowerCase();
//   return cls === "object" || cls === "variable";
// };

// const updateNodeById = (root: UaNode, nodeId: string, updater: (n: UaNode) => UaNode): UaNode => {
//   if (root.nodeId === nodeId) return updater(root);

//   if (!root.children || root.children.length === 0) return root;

//   const newChildren = root.children.map((c) => updateNodeById(c, nodeId, updater));
//   // avoid unnecessary object churn
//   const same = newChildren.every((c, i) => c === root.children![i]);
//   return same ? root : { ...root, children: newChildren };
// };

// // COMPONENT IS DISABLED - NOT EXPORTED
// // export const OPCUAAddressSpace: React.FC = () => {
// const OPCUAAddressSpace_OLD: React.FC = () => {
//   const { url: OPC_UA_URL } = useUrlContext();
//   const socket = useSocket();

//   const [isOpen, setIsOpen] = useState(true);

//   // JSON Tree instead of HTML
//   const [root, setRoot] = useState<UaNode | null>(null);

//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);

//   // SUBSCRIPTIONS: list of subscribed nodes with last known value
//   const [subscriptions, setSubscriptions] = useState<
//     { nodeId: string; attributes: Record<string, string>; value?: string | null }[]
//   >([]);

//   // EVENT SUBSCRIPTIONS
//   const [eventSubscriptions, setEventSubscriptions] = useState<
//     { nodeId: string; attributes: Record<string, string> }[]
//   >([]);

//   // METHOD CALL DIALOG
//   const [methodDialogOpen, setMethodDialogOpen] = useState(false);
//   const [methodNode, setMethodNode] = useState<SelectedNodeInfo | null>(null);
//   const [methodInputsJSON, setMethodInputsJSON] = useState("{}");
//   const [methodResult, setMethodResult] = useState<string | null>(null);

//   // Polling interval (ms)
//   const POLL_MS = 2000;
//   const pollRef = useRef<number | null>(null);

//   // Toggle Open/Close with reset
//   const toggleOpen = () => {
//     setIsOpen((prev) => {
//       const next = !prev;
//       if (!next) {
//         setRoot(null);
//         setSelectedNode(null);
//         setError(null);
//         setLoading(false);
//       }
//       return next;
//     });
//   };

//   // ---- Backend calls ----
//   const fetchChildren = async (nodeId: string): Promise<UaNode[]> => {
//     const encodedUrl = encodeURIComponent(OPC_UA_URL);
//     const encodedNodeId = encodeURIComponent(nodeId);
//     const res = await fetch(`${REST_BACKEND_BASE}/opcua/browse?url=${encodedUrl}&node_id=${encodedNodeId}`);

//     if (!res.ok) {
//       const txt = await res.text().catch(() => "<no-body>");
//       throw new Error(`HTTP ${res.status}: ${txt}`);
//     }
//     const data = await res.json();
//     const children = (data?.children ?? []) as UaNode[];

//     // normalize fields to ensure displayName exists
//     return children.map((c) => ({
//       nodeId: c.nodeId,
//       displayName: c.displayName ?? c.browseName ?? c.nodeId,
//       browseName: c.browseName,
//       nodeClass: c.nodeClass ?? "Unknown",
//       children: c.children ?? undefined,
//       loaded: false,
//       expanded: false,
//       loading: false,
//     }));
//   };

//   // ---- Load root on open/url change ----
//   useEffect(() => {
//     if (!isOpen || !OPC_UA_URL) return;

//     const loadRoot = async () => {
//       try {
//         setLoading(true);
//         setError(null);

//         // RootFolder is i=84
//         const children = await fetchChildren("i=84");

//         setRoot({
//           nodeId: "i=84",
//           displayName: "Root",
//           browseName: "0:RootFolder",
//           nodeClass: "Object",
//           children,
//           loaded: true,
//           expanded: true,
//           loading: false,
//         });
//       } catch (e: any) {
//         console.error("[OPCUAAddressSpace] Root load error:", e);
//         setError(e?.message ?? "Unbekannter Fehler beim Laden.");
//         setRoot(null);
//       } finally {
//         setLoading(false);
//       }
//     };

//     loadRoot();
//   }, [isOpen, OPC_UA_URL]);

//   // ---- Expand/collapse with lazy-load ----
//   const toggleNode = async (nodeId: string) => {
//     if (!root) return;

//     // optimistic expand/collapse
//     let targetNode: UaNode | null = null;

//     // first toggle expanded state quickly
//     setRoot((prev) => {
//       if (!prev) return prev;

//       const next = updateNodeById(prev, nodeId, (n) => {
//         targetNode = n;
//         return { ...n, expanded: !n.expanded };
//       });

//       return next;
//     });

//     // If we just expanded and children not loaded yet -> fetch them
//     // We need to re-find the node state after toggle
//     const getNodeState = (n: UaNode): UaNode | null => {
//       if (n.nodeId === nodeId) return n;
//       for (const ch of n.children ?? []) {
//         const f = getNodeState(ch);
//         if (f) return f;
//       }
//       return null;
//     };

//     const current = root ? getNodeState(root) : null;
//     // The "current" might be stale due to async state updates; so re-check using a functional update below:
//     setRoot((prev) => {
//       if (!prev) return prev;
//       const now = getNodeState(prev);
//       if (!now) return prev;

//       // if collapsed or already loaded or already loading => nothing
//       if (!now.expanded || now.loaded || now.loading) return prev;

//       return updateNodeById(prev, nodeId, (n) => ({ ...n, loading: true }));
//     });

//     try {
//       // wait a tick to let state apply, then read children
//       const children = await fetchChildren(nodeId);

//       setRoot((prev) => {
//         if (!prev) return prev;
//         return updateNodeById(prev, nodeId, (n) => ({
//           ...n,
//           children,
//           loaded: true,
//           loading: false,
//           // if no children, keep expanded false-ish feel? -> leave expanded as-is
//         }));
//       });
//     } catch (e) {
//       console.error("[OPCUAAddressSpace] toggleNode load error:", e);
//       setRoot((prev) => {
//         if (!prev) return prev;
//         return updateNodeById(prev, nodeId, (n) => ({
//           ...n,
//           loading: false,
//           loaded: true, // prevent endless retry spam on every click; you can change to false if you want
//           children: n.children ?? [],
//         }));
//       });
//     }
//   };

//   // ---- Selection (right click) ----
//   const selectNode = (node: UaNode) => {
//     const attrs: Record<string, string> = {
//       nodeclass: nodeClassToNumericString(node.nodeClass),
//       nodeClass: node.nodeClass,
//       displayName: node.displayName,
//     };
//     if (node.browseName) attrs.browseName = node.browseName;

//     setSelectedNode({
//       nodeId: node.nodeId,
//       attributes: attrs,
//     });
//   };

//   // ---- Subscriptions / Events / Methods (unchanged logic) ----
//   const addSubscription = (node: SelectedNodeInfo) => {
//     const nodeClass = node?.attributes?.nodeclass;
//     if (nodeClass !== "2") {
//       console.warn("[addSubscription] Can only subscribe to Variables (NodeClass 2)");
//       return;
//     }

//     setSubscriptions((prev) => {
//       if (prev.find((s) => s.nodeId === node.nodeId)) return prev;

//       if (socket && socket.readyState === WebSocket.OPEN && OPC_UA_URL) {
//         const payload = JSON.stringify({ url: OPC_UA_URL, nodeId: node.nodeId });
//         const msg = `subscribe|${payload}`;
//         (socket as WebSocket).send(msg);
//         console.log("[OPCUAAddressSpace] Sent subscribe message:", msg);
//       }

//       return [...prev, { nodeId: node.nodeId, attributes: node.attributes, value: null }];
//     });
//   };

//   const removeSubscription = (nodeId: string) => {
//     if (socket && socket.readyState === WebSocket.OPEN && OPC_UA_URL) {
//       const payload = JSON.stringify({ url: OPC_UA_URL, nodeId });
//       const msg = `unsubscribe|${payload}`;
//       (socket as WebSocket).send(msg);
//       console.log("[OPCUAAddressSpace] Sent unsubscribe message:", msg);
//     }
//     setSubscriptions((prev) => prev.filter((s) => s.nodeId !== nodeId));
//   };

//   const addEventSubscription = (node: SelectedNodeInfo) => {
//     const nodeClass = node?.attributes?.nodeclass;
//     if (nodeClass !== "1") {
//       console.warn("[addEventSubscription] Can only subscribe to Events on Objects (NodeClass 1)");
//       return;
//     }

//     setEventSubscriptions((prev) => {
//       if (prev.find((s) => s.nodeId === node.nodeId)) return prev;

//       if (socket && socket.readyState === WebSocket.OPEN && OPC_UA_URL) {
//         const payload = JSON.stringify({ url: OPC_UA_URL, nodeId: node.nodeId });
//         const msg = `subscribeEvent|${payload}`;
//         (socket as WebSocket).send(msg);
//         console.log("[OPCUAAddressSpace] Sent event subscribe message:", msg);
//       }

//       return [...prev, { nodeId: node.nodeId, attributes: node.attributes }];
//     });
//   };

//   const removeEventSubscription = (nodeId: string) => {
//     if (socket && socket.readyState === WebSocket.OPEN && OPC_UA_URL) {
//       const payload = JSON.stringify({ url: OPC_UA_URL });
//       const msg = `unsubscribeEvent|${payload}`;
//       (socket as WebSocket).send(msg);
//       console.log("[OPCUAAddressSpace] Sent event unsubscribe message:", msg);
//     }

//     setEventSubscriptions((prev) => prev.filter((s) => s.nodeId !== nodeId));
//   };

//   const openMethodDialog = (node: SelectedNodeInfo) => {
//     const nodeClass = node?.attributes?.nodeclass;
//     if (nodeClass !== "4") {
//       console.warn("[openMethodDialog] Can only call Methods (NodeClass 4)");
//       return;
//     }
//     setMethodNode(node);
//     setMethodDialogOpen(true);
//     setMethodInputsJSON("{}");
//     setMethodResult(null);
//   };

//   const callMethod = () => {
//     if (!methodNode || !socket || socket.readyState !== WebSocket.OPEN || !OPC_UA_URL) return;

//     try {
//       const inputs = JSON.parse(methodInputsJSON);
//       const payload = JSON.stringify({
//         url: OPC_UA_URL,
//         nodeId: methodNode.nodeId,
//         inputs,
//       });

//       const msg = `call|${payload}`;
//       (socket as WebSocket).send(msg);
//       console.log("[OPCUAAddressSpace] Sent method call:", msg);
//       setMethodResult("Calling method...");
//     } catch (err: any) {
//       setMethodResult(`❌ Invalid JSON: ${err.message}`);
//     }
//   };

//   const closeMethodDialog = () => {
//     setMethodDialogOpen(false);
//     setMethodNode(null);
//     setMethodInputsJSON("{}");
//     setMethodResult(null);
//   };

//   // WebSocket listener for method call results
//   useEffect(() => {
//     if (!socket) return;

//     const lastMessage = (socket as any).lastMessage;
//     if (!lastMessage) return;

//     const message = lastMessage.data;
//     console.log("[OPCUAAddressSpace] Received WebSocket message:", message);

//     if (message.startsWith("Method call result:")) {
//       const result = message.replace("Method call result:", "").trim();
//       setMethodResult(result);
//     } else if (message.startsWith("❌") && message.toLowerCase().includes("method")) {
//       setMethodResult(message);
//     }
//   }, [socket, (socket as any)?.lastMessage]);

//   // Polling effect: request latest value for all subscribed nodes periodically
//   useEffect(() => {
//     if (pollRef.current) {
//       window.clearInterval(pollRef.current);
//       pollRef.current = null;
//     }

//     if (subscriptions.length === 0) return;

//     const id = window.setInterval(async () => {
//       const results = await Promise.all(
//         subscriptions.map(async (s) => {
//           try {
//             const encodedUrl = encodeURIComponent(OPC_UA_URL);
//             const encodedNodeId = encodeURIComponent(s.nodeId);
//             const res = await fetch(`${REST_BACKEND_BASE}/node_value?url=${encodedUrl}&nodeid=${encodedNodeId}`);
//             if (!res.ok) {
//               const txt = await res.text().catch(() => "<no-body>");
//               console.warn(`[OPCUAAddressSpace] node_value returned ${res.status} for ${s.nodeId}:`, txt);
//               return { nodeId: s.nodeId, value: `error(${res.status})` };
//             }

//             let payload: any = null;
//             try {
//               payload = await res.json();
//             } catch {
//               payload = await res.text();
//             }
//             const value = payload?.value ?? (typeof payload === "string" ? payload : JSON.stringify(payload));
//             return { nodeId: s.nodeId, value: String(value) };
//           } catch (err: any) {
//             console.error("[OPCUAAddressSpace] poll error for", s.nodeId, err);
//             return { nodeId: s.nodeId, value: `error(${err?.message ?? "network"})` };
//           }
//         })
//       );

//       setSubscriptions((prev) =>
//         prev.map((p) => {
//           const r = results.find((x) => x.nodeId === p.nodeId);
//           return r ? { ...p, value: r.value } : p;
//         })
//       );
//     }, POLL_MS);

//     pollRef.current = id;
//     return () => {
//       if (pollRef.current) {
//         window.clearInterval(pollRef.current);
//         pollRef.current = null;
//       }
//     };
//   }, [subscriptions, OPC_UA_URL]);

//   // ---- Styling ----
//   const treeCss = `
//     #info-content,
//     #info-content * {
//       text-align: left !important;
//     }

//     #info-content {
//       font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
//       color: #f5f5f5;
//       user-select: none;
//     }

//     .ua-node-row {
//       padding: 2px 4px;
//       border-radius: 4px;
//     }

//     .ua-node-row:hover {
//       background: rgba(255,255,255,0.06);
//     }
//   `;

//   // ---- Tree render ----
//   const renderNode = (node: UaNode, level: number) => {
//     const expandable = isLikelyExpandable(node);
//     const hasRealChildren = (node.children?.length ?? 0) > 0;

//     const showArrow =
//       node.loading ||
//       (node.loaded ? hasRealChildren : expandable);

//     const arrowChar = node.loading ? "…" : node.expanded ? "▾" : "▸";

//     return (
//       <div key={node.nodeId}>
//         <div
//           className="ua-node-row"
//           style={{
//             paddingLeft: level * INDENT_PER_LEVEL_PX,
//             display: "flex",
//             gap: 6,
//             alignItems: "center",
//             cursor: showArrow ? "pointer" : "default",
//           }}
//           onClick={() => {
//             // left click: expand/collapse
//             if (showArrow) toggleNode(node.nodeId);
//           }}
//           onContextMenu={(e) => {
//             e.preventDefault();
//             selectNode(node);
//           }}
//           title={node.nodeId}
//         >
//           <span style={{ width: 16, color: "#aaa" }}>
//             {showArrow ? arrowChar : "•"}
//           </span>

//           <span style={{ color: "#fff" }}>{node.displayName}</span>

//           <span style={{ color: "#777" }}>
//             ({node.nodeClass})
//           </span>
//         </div>

//         {node.expanded && node.children?.map((c) => renderNode(c, level + 1))}

//         {node.expanded && node.loaded && (node.children?.length ?? 0) === 0 && (
//           <div style={{ paddingLeft: (level + 1) * INDENT_PER_LEVEL_PX, color: "#666", fontSize: 12, paddingTop: 2 }}>
//             (keine Kinder)
//           </div>
//         )}
//       </div>
//     );
//   };

//   return (
//     <div
//       style={{
//         position: "fixed",
//         top: "1rem",
//         right: "1rem",
//         width: "750px",
//         maxHeight: "80vh",
//         zIndex: 9999,
//         border: "1px solid #444",
//         borderRadius: 8,
//         overflow: "hidden",
//         background: "#1b1b1b",
//         boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
//       }}
//     >
//       {/* Header */}
//       <div
//         style={{
//           background: "#111",
//           padding: "8px 12px",
//           display: "flex",
//           justifyContent: "space-between",
//           alignItems: "center",
//           fontSize: 14,
//         }}
//       >
//         <div>
//           <strong>OPC UA Address Space</strong>
//           <div style={{ fontSize: 11, color: "#888" }}>
//             URL: <code>{OPC_UA_URL}</code>
//           </div>
//         </div>
//         <button onClick={toggleOpen}>{isOpen ? "×" : "Adressraum öffnen"}</button>
//       </div>

//       {/* Inhalt */}
//       {isOpen && (
//         <div
//           style={{
//             padding: "8px 12px",
//             maxHeight: "calc(80vh - 48px)",
//             overflow: "auto",
//             fontSize: 13,
//             background: "#1b1b1b",
//           }}
//         >
//           <style>{treeCss}</style>

//           {!OPC_UA_URL && !loading && !error && (
//             <div style={{ color: "#aaa" }}>
//               Bitte verbinde dich zuerst mit einem OPC UA Server über die Connect Komponente.
//             </div>
//           )}

//           {loading && (
//             <div style={{ color: "#aaa" }}>
//               Lade Address Space von <code>{OPC_UA_URL}</code> …
//             </div>
//           )}

//           {!loading && error && (
//             <div style={{ color: "#f66" }}>
//               Fehler beim Laden des Address Space:
//               <br />
//               {error}
//             </div>
//           )}

//           {!loading && !error && root && (
//             <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
//               {/* Left: Tree */}
//               <div id="info-content" style={{ flex: 1 }}>
//                 {renderNode(root, 0)}
//               </div>

//               {/* Right: Node Info + Widgets */}
//               <div
//                 style={{
//                   width: 300,
//                   minHeight: 160,
//                   borderLeft: "1px solid #333",
//                   paddingLeft: 12,
//                   color: "#ddd",
//                   flexShrink: 0,
//                 }}
//               >
//                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
//                   <strong>Node Information</strong>
//                   <button
//                     onClick={() => setSelectedNode(null)}
//                     style={{ background: "transparent", border: "1px solid #333", color: "#ccc", padding: "2px 6px", borderRadius: 4 }}
//                   >
//                     Clear
//                   </button>
//                 </div>

//                 {!selectedNode && (
//                   <div style={{ color: "#888", fontSize: 13 }}>
//                     Rechtsklick auf einen Knoten, um Informationen anzuzeigen.
//                     <div style={{ marginTop: 12, color: "#777", fontSize: 12 }}>
//                       Platz für weitere Widgets (Methoden-Panel, Subscriptions, Properties).
//                     </div>
//                   </div>
//                 )}

//                 {selectedNode && (
//                   <div style={{ fontSize: 13 }}>
//                     <div style={{ marginBottom: 8 }}>
//                       <div style={{ color: "#aaa", fontSize: 12 }}>NodeId</div>
//                       <div style={{ color: "#fff", wordBreak: "break-all" }}>{selectedNode.nodeId}</div>
//                     </div>

//                     <div style={{ marginBottom: 8 }}>
//                       <div style={{ color: "#aaa", fontSize: 12 }}>Attributes</div>
//                       <div style={{ marginTop: 6 }}>
//                         {Object.keys(selectedNode.attributes).length === 0 && (
//                           <div style={{ color: "#777" }}>Keine Attribute gefunden.</div>
//                         )}
//                         {Object.entries(selectedNode.attributes).map(([k, v]) => (
//                           <div key={k} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
//                             <div style={{ color: "#999", minWidth: 110 }}>{k}</div>
//                             <div style={{ color: "#fff", flex: 1 }}>{v}</div>
//                           </div>
//                         ))}
//                       </div>
//                     </div>

//                     {/* Actions */}
//                     <div style={{ marginTop: 12, borderTop: "1px dashed #2b2b2b", paddingTop: 10 }}>
//                       <div style={{ color: "#aaa", fontSize: 12, marginBottom: 6 }}>Actions / Details</div>
//                       <div style={{ marginTop: 10 }}>
//                         <button style={{ padding: "6px 8px", marginRight: 8 }} onClick={() => openMethodDialog(selectedNode)}>
//                           Call Method
//                         </button>
//                         <button style={{ padding: "6px 8px", marginRight: 8 }} onClick={() => addSubscription(selectedNode)}>
//                           Subscribe
//                         </button>
//                         <button style={{ padding: "6px 8px" }} onClick={() => addEventSubscription(selectedNode)}>
//                           Subscribe Events
//                         </button>
//                       </div>
//                     </div>
//                   </div>
//                 )}

//                 {/* Subscriptions panel */}
//                 <div style={{ marginTop: 16, borderTop: "1px solid #2b2b2b", paddingTop: 10 }}>
//                   <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
//                     <strong>Subscriptions</strong>
//                     <div style={{ color: "#888", fontSize: 12 }}>{subscriptions.length} active</div>
//                   </div>

//                   {subscriptions.length === 0 && (
//                     <div style={{ color: "#777", fontSize: 12 }}>
//                       Keine Abonnements. Wähle einen Knoten und klicke "Subscribe".
//                     </div>
//                   )}

//                   {subscriptions.map((s) => (
//                     <div key={s.nodeId} style={{ marginBottom: 8, padding: "6px 8px", background: "#121212", borderRadius: 6 }}>
//                       <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
//                         <div style={{ minWidth: 0 }}>
//                           <div style={{ color: "#999", fontSize: 11 }}>NodeId</div>
//                           <div style={{ color: "#fff", fontSize: 13, wordBreak: "break-all" }}>{s.nodeId}</div>
//                         </div>
//                         <div style={{ textAlign: "right" }}>
//                           <div style={{ color: "#999", fontSize: 11 }}>Value</div>
//                           <div style={{ color: "#fff", fontSize: 13 }}>{s.value ?? "…"}</div>
//                         </div>
//                       </div>
//                       <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end", gap: 8 }}>
//                         <button
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             removeSubscription(s.nodeId);
//                           }}
//                           style={{ padding: "4px 8px" }}
//                         >
//                           Unsubscribe
//                         </button>
//                       </div>
//                     </div>
//                   ))}
//                 </div>

//                 {/* Event Subscriptions panel */}
//                 <div style={{ marginTop: 16, borderTop: "1px solid #2b2b2b", paddingTop: 10 }}>
//                   <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
//                     <strong>Event Subscriptions</strong>
//                     <div style={{ color: "#888", fontSize: 12 }}>{eventSubscriptions.length} active</div>
//                   </div>

//                   {eventSubscriptions.length === 0 && (
//                     <div style={{ color: "#777", fontSize: 12 }}>
//                       Keine Event-Abonnements. Wähle einen Knoten und klicke "Subscribe Events".
//                     </div>
//                   )}

//                   {eventSubscriptions.map((s) => (
//                     <div key={s.nodeId} style={{ marginBottom: 8, padding: "6px 8px", background: "#121012", borderRadius: 6 }}>
//                       <div style={{ minWidth: 0, marginBottom: 6 }}>
//                         <div style={{ color: "#999", fontSize: 11 }}>NodeId</div>
//                         <div style={{ color: "#fff", fontSize: 13, wordBreak: "break-all" }}>{s.nodeId}</div>
//                       </div>
//                       <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
//                         <button
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             removeEventSubscription(s.nodeId);
//                           }}
//                           style={{ padding: "4px 8px" }}
//                         >
//                           Unsubscribe Events
//                         </button>
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </div>
//           )}

//           {!loading && !error && !root && OPC_UA_URL && (
//             <div style={{ color: "#888" }}>Noch keine Daten geladen (oder leerer Address Space).</div>
//           )}
//         </div>
//       )}

//       {/* Method Call Dialog */}
//       {methodDialogOpen && (
//         <div
//           style={{
//             position: "fixed",
//             top: 0,
//             left: 0,
//             right: 0,
//             bottom: 0,
//             background: "rgba(0,0,0,0.7)",
//             zIndex: 10000,
//             display: "flex",
//             alignItems: "center",
//             justifyContent: "center",
//           }}
//           onClick={closeMethodDialog}
//         >
//           <div
//             style={{
//               background: "#1b1b1b",
//               border: "1px solid #444",
//               borderRadius: 8,
//               padding: "16px",
//               minWidth: "400px",
//               maxWidth: "600px",
//               maxHeight: "80vh",
//               overflow: "auto",
//               color: "#f5f5f5",
//             }}
//             onClick={(e) => e.stopPropagation()}
//           >
//             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
//               <h3 style={{ margin: 0, fontSize: 16 }}>Call Method</h3>
//               <button
//                 onClick={closeMethodDialog}
//                 style={{ background: "transparent", border: "1px solid #333", color: "#ccc", padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}
//               >
//                 ×
//               </button>
//             </div>

//             {methodNode && (
//               <div style={{ marginBottom: 12 }}>
//                 <div style={{ color: "#aaa", fontSize: 12 }}>NodeId</div>
//                 <div style={{ color: "#fff", fontSize: 13, wordBreak: "break-all" }}>{methodNode.nodeId}</div>
//               </div>
//             )}

//             <div style={{ marginBottom: 16 }}>
//               <label style={{ display: "block", color: "#ccc", fontSize: 13, marginBottom: 6 }}>Input Parameters (JSON)</label>
//               <div style={{ color: "#888", fontSize: 11, marginBottom: 6 }}>Example: {`{"paramName":"value","count":42}`}</div>
//               <textarea
//                 value={methodInputsJSON}
//                 onChange={(e) => setMethodInputsJSON(e.target.value)}
//                 style={{
//                   width: "100%",
//                   minHeight: "100px",
//                   padding: "8px",
//                   background: "#121212",
//                   border: "1px solid #333",
//                   borderRadius: 4,
//                   color: "#fff",
//                   fontSize: 13,
//                   fontFamily: "monospace",
//                   resize: "vertical",
//                 }}
//               />
//             </div>

//             <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
//               <button
//                 onClick={callMethod}
//                 style={{ padding: "8px 16px", background: "#2a7fff", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer" }}
//               >
//                 Call Method
//               </button>
//               <button
//                 onClick={closeMethodDialog}
//                 style={{ padding: "8px 16px", background: "transparent", border: "1px solid #444", borderRadius: 4, color: "#ccc", cursor: "pointer" }}
//               >
//                 Cancel
//               </button>
//             </div>

//             {methodResult && (
//               <div style={{ padding: "12px", background: "#121212", border: "1px solid #333", borderRadius: 6, color: "#fff", fontSize: 13 }}>
//                 <div style={{ color: "#aaa", fontSize: 12, marginBottom: 6 }}>Result</div>
//                 <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{methodResult}</pre>
//               </div>
//             )}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// // NOT EXPORTED - This file is kept for reference only
// // Use the new components in ./Adressspace/ instead
// // export default OPCUAAddressSpace;
