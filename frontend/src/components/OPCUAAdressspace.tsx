import React, { useEffect, useMemo, useRef, useState } from "react";
import { useUrlContext } from "../contexts/UrlContext";
import { useSocket } from "../hooks/use-socket";

type SelectedNodeInfo = {
  nodeId: string;
  attributes: Record<string, string>;
};

const REST_BACKEND_BASE = "http://127.0.0.1:8001"; //FastApi backend base url port 8000


const INDENT_PER_LEVEL_PX = 10; // px per tree level for indentation

export const OPCUAAddressSpace: React.FC = () => {
  const { url: OPC_UA_URL } = useUrlContext(); // Get URL from context
  const socket = useSocket(); // Get WebSocket connection
  const [isOpen, setIsOpen] = useState(true); // variable to track if the address space panel is open + function to toggle it
  const [html, setHtml] = useState<string | null>(null); // actual HTML content of the address space
  const [loading, setLoading] = useState(false); // loading state
  const [error, setError] = useState<string | null>(null); // error state

  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);

  // SUBSCRIPTIONS: list of subscribed nodes with last known value
  const [subscriptions, setSubscriptions] = useState<
    { nodeId: string; attributes: Record<string, string>; value?: string | null }[]
  >([]);

  // EVENT SUBSCRIPTIONS: list of nodes subscribed to events
  const [eventSubscriptions, setEventSubscriptions] = useState<
    { nodeId: string; attributes: Record<string, string> }[]
  >([]);

  // METHOD CALL DIALOG: state for method calling
  const [methodDialogOpen, setMethodDialogOpen] = useState(false);
  const [methodNode, setMethodNode] = useState<SelectedNodeInfo | null>(null);
  const [methodInputsJSON, setMethodInputsJSON] = useState("{}");
  const [methodResult, setMethodResult] = useState<string | null>(null);

  // Polling interval (ms)
  const POLL_MS = 2000;
  const pollRef = useRef<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null); // pointer to the container in which the address space tree is rendered

  // Manually update innerHTML only when html changes to prevent tree collapse
  useEffect(() => {
    if (containerRef.current && html) {
      containerRef.current.innerHTML = html;
    } else if (containerRef.current && !html) {
      containerRef.current.innerHTML = '';
    }
  }, [html]);

    // --- Toggle Open/Close --- with reset of the tree after closing to avoid errors on reopen
  const toggleOpen = () => {
  setIsOpen((prev) => {
    const next = !prev;
    
    if (!next) {
      setHtml(null);      
      setError(null);     
      setLoading(false);  
    }

    return next;
  });
};


  
  const reindentTree = () => {
    const container = containerRef.current; // get the container element
    if (!container) return; 

    const summaries = container.querySelectorAll("summary"); //search all summary elements in the container, where a summary element is a kind of arraylist 
    summaries.forEach((summary) => {  // for each summary element found we calculate its depth in the tree and set the padding accordingly
      let depth = 0;
      let el: HTMLElement | null = summary as HTMLElement;

      // traverse up the DOM tree to count how many <details> ancestors there are (= depth in the tree)
      while (el && el !== container) {
        el = el.parentElement as HTMLElement | null;
        if (el && el.tagName.toLowerCase() === "details") {
          depth++;
        }
      }


    
      //Root was on depth 1, we want it to be 0 for the ordering
      const level = Math.max(depth - 1, 0);

      // set left padding based on depth
      const li = summary.closest("li") as HTMLElement | null;
      if (li) {
        li.style.paddingLeft = `${level * INDENT_PER_LEVEL_PX}px`; 
      }
    });
  };

 



 //this is the main logic of the component, we encode the url and fetch the html from the backend
 //Some error handling is also implemented here

  useEffect(() => {
    if (!isOpen || !OPC_UA_URL) return; // Don't load if no URL connected

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const encodedUrl = encodeURIComponent(OPC_UA_URL);
        const fetchUrl = `${REST_BACKEND_BASE}/device_set_rendered?url=${encodedUrl}`;
        console.log("[OPCUAAddressSpace] Fetching from:", fetchUrl);
        console.log("[OPCUAAddressSpace] OPC_UA_URL:", OPC_UA_URL);
        
        const res = await fetch(fetchUrl);

        console.log("[OPCUAAddressSpace] Response status:", res.status);
        
        if (!res.ok) {  
          const errorText = await res.text();
          console.error("[OPCUAAddressSpace] Error response:", errorText);
          throw new Error(`HTTP ${res.status}: ${errorText}`);
        }

        const text = await res.text();
        console.log("[OPCUAAddressSpace] HTML geladen");
        setHtml(text);
      } catch (e: any) {
        console.error("[OPCUAAddressSpace] Fehler:", e);
        setError(e?.message ?? "Unbekannter Fehler beim Laden.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isOpen, OPC_UA_URL]);



  
  useEffect(() => {
    if (!isOpen || !html) return;
    setTimeout(reindentTree, 0); 
  }, [isOpen, html]);



  useEffect(() => {
    if (!isOpen || !html) return;

    const container = containerRef.current;
    if (!container) return;

    const handleClick = async (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;

      // left click: keep default expand/collapse behaviour, but load subtree if needed
      // find nearest clickable summary/span
      const clickable = target.closest("summary, span") as HTMLElement | null;
      if (!clickable) return;

      // robust node element lookup (ancestor with data-node-id or child)
      let nodeEl = (target as HTMLElement).closest("[data-node-id]") as HTMLElement | null;
      if (!nodeEl && clickable) {
        nodeEl = clickable.querySelector("[data-node-id]") as HTMLElement | null;
      }
      if (!nodeEl) nodeEl = clickable;

      const nodeId = nodeEl?.dataset?.nodeId;
      if (!nodeId) return;

      const details = clickable.closest("details");
      if (!details) return;

      // ensure there's a <ul> to populate (create one if absent)
      let ul = details.querySelector("ul") as HTMLUListElement | null;
      if (!ul) {
        ul = document.createElement("ul");
        details.appendChild(ul);
      }

      // do NOT setSelectedNode here — selection is on right-click now

      // if subtree already loaded, skip fetch
      const alreadyLoaded = ul.classList.contains("subtree-loaded");
      if (alreadyLoaded) {
        return;
      }

      // open optimistically and show loading
      (details as HTMLDetailsElement).open = true;
      const prevHtml = ul.innerHTML;
      ul.innerHTML = `<li style="color:#888;font-size:12px;padding:6px 0">Lade…</li>`;

      try {
        const encodedUrl = encodeURIComponent(OPC_UA_URL);
        const encodedNodeId = encodeURIComponent(nodeId);

        const res = await fetch(
          `${REST_BACKEND_BASE}/subtree_children?url=${encodedUrl}&nodeid=${encodedNodeId}`
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const fragmentHtml = await res.text();
        const staging = document.createElement("div");
        staging.innerHTML = fragmentHtml;

        ul.innerHTML = staging.innerHTML;
        ul.classList.add("subtree-loaded");
        (details as HTMLDetailsElement).open = true;
        reindentTree();
      } catch (err) {
        console.error("[OPCUAAddressSpace] Fehler beim Subtree-Load:", err);
        ul.innerHTML = prevHtml || `<li style="color:#f66;font-size:12px;padding:6px 0">Fehler beim Laden</li>`;
      }
    };

    // right-click handler: show Node Information without preventing normal expand/collapse on left-click
    const handleContextMenu = (ev: MouseEvent) => {
      ev.preventDefault(); // prevent browser menu so user sees our info panel
      const target = ev.target as HTMLElement | null;
      if (!target) return;

      // find nearest element that carries data-node-id
      const clickable = target.closest("summary, span") as HTMLElement | null;
      if (!clickable) return;

      
      let nodeEl = (target as HTMLElement).closest("[data-node-id]") as HTMLElement | null;
      if (!nodeEl && clickable) {
        nodeEl = clickable.querySelector("[data-node-id]") as HTMLElement | null;
      }
      if (!nodeEl) nodeEl = clickable;

      const nodeId = nodeEl?.dataset?.nodeId;
      if (!nodeId) return;

      const attrs = { ...(nodeEl.dataset as DOMStringMap) } as Record<string, string>;

      setSelectedNode({
        nodeId,
        attributes: attrs,
      });
    };

    container.addEventListener("click", handleClick);
    container.addEventListener("contextmenu", handleContextMenu);
    return () => {
      container.removeEventListener("click", handleClick);
      container.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [isOpen, html]);



  // Styling: 


  const treeCss = `
    
    #info-content,
    #info-content * {
      text-align: left !important;
    }

    #info-content {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #f5f5f5;
    }

    #info-content summary {
      cursor: pointer;
    }

    #info-content summary:hover {
      background: rgba(255,255,255,0.06);
    }

    #info-content ul {
      margin: 0;
      padding-left: 0;
    }

    #info-content li {
      list-style: none;
    }
  `;

const addSubscription = (node: SelectedNodeInfo) => {
    const nodeClass = node?.attributes?.nodeclass;
    if (nodeClass !== "2") {
      console.warn("[addSubscription] Can only subscribe to Variables (NodeClass 2)");
      return;
    }
    setSubscriptions((prev) => {
      if (prev.find((s) => s.nodeId === node.nodeId)) return prev;

      // Send subscribe message to backend via WebSocket
      if (socket && socket.readyState === WebSocket.OPEN && OPC_UA_URL) {
        const payload = JSON.stringify({
          url: OPC_UA_URL,
          nodeId: node.nodeId
        });
        const msg = `subscribe|${payload}`;
        (socket as WebSocket).send(msg);
        console.log("[OPCUAAddressSpace] Sent subscribe message:", msg);
      }

      return [...prev, { nodeId: node.nodeId, attributes: node.attributes, value: null }];
    });

  };

  const removeSubscription = (nodeId: string) => {
    // Send unsubscribe message to backend
    if (socket && socket.readyState === WebSocket.OPEN && OPC_UA_URL) {
      const payload = JSON.stringify({
        url: OPC_UA_URL,
        nodeId: nodeId
      });
      const msg = `unsubscribe|${payload}`;
      (socket as WebSocket).send(msg);
      console.log("[OPCUAAddressSpace] Sent unsubscribe message:", msg);
    }

    setSubscriptions((prev) => prev.filter((s) => s.nodeId !== nodeId));
  };

  const addEventSubscription = (node: SelectedNodeInfo) => {
    const nodeClass = node?.attributes?.nodeclass;
    if (nodeClass !== "1") {
      console.warn("[addEventSubscription] Can only subscribe to Events on Objects (NodeClass 1)");
      return;
    }
    setEventSubscriptions((prev) => {
      if (prev.find((s) => s.nodeId === node.nodeId)) return prev;

      // Send subscribe event message to backend via WebSocket
      if (socket && socket.readyState === WebSocket.OPEN && OPC_UA_URL) {
        const payload = JSON.stringify({
          url: OPC_UA_URL,
          nodeId: node.nodeId
        });
        const msg = `subscribeEvent|${payload}`;
        (socket as WebSocket).send(msg);
        console.log("[OPCUAAddressSpace] Sent event subscribe message:", msg);
      }

      return [...prev, { nodeId: node.nodeId, attributes: node.attributes }];
    });
  };

  const removeEventSubscription = (nodeId: string) => {
    // Send unsubscribe event message to backend
    if (socket && socket.readyState === WebSocket.OPEN && OPC_UA_URL) {
      const payload = JSON.stringify({
        url: OPC_UA_URL
      });
      const msg = `unsubscribeEvent|${payload}`;
      (socket as WebSocket).send(msg);
      console.log("[OPCUAAddressSpace] Sent event unsubscribe message:", msg);
    }

    setEventSubscriptions((prev) => prev.filter((s) => s.nodeId !== nodeId));
  };

  const openMethodDialog = (node: SelectedNodeInfo) => {
    const nodeClass = node?.attributes?.nodeclass;
    if (nodeClass !== "4") {
      console.warn("[openMethodDialog] Can only call Methods (NodeClass 4)");
      return;
    }
    setMethodNode(node);
    setMethodDialogOpen(true);
    setMethodInputsJSON("{}");
    setMethodResult(null);
  };

  const callMethod = () => {
    if (!methodNode || !socket || socket.readyState !== WebSocket.OPEN || !OPC_UA_URL) return;

    try {
      const inputs = JSON.parse(methodInputsJSON);
      const payload = JSON.stringify({
        url: OPC_UA_URL,
        nodeId: methodNode.nodeId,
        inputs: inputs
      });

      const msg = `call|${payload}`;
      (socket as WebSocket).send(msg);
      console.log("[OPCUAAddressSpace] Sent method call:", msg);
      setMethodResult("Calling method...");
    } catch (err: any) {
      setMethodResult(`❌ Invalid JSON: ${err.message}`);
    }
  };

  const closeMethodDialog = () => {
    setMethodDialogOpen(false);
    setMethodNode(null);
    setMethodInputsJSON("{}");
    setMethodResult(null);
  };

  // WebSocket listener for method call results
  useEffect(() => {
    if (!socket) return;

    const lastMessage = (socket as any).lastMessage;
    if (!lastMessage) return;

    const message = lastMessage.data;
    console.log("[OPCUAAddressSpace] Received WebSocket message:", message);
    
    if (message.startsWith("Method call result:")) {
      const result = message.replace("Method call result:", "").trim();
      console.log("[OPCUAAddressSpace] Setting method result:", result);
      setMethodResult(result);
    } else if (message.startsWith("❌") && message.toLowerCase().includes("method")) {
      console.log("[OPCUAAddressSpace] Setting method error:", message);
      setMethodResult(message);
    }
  }, [socket, (socket as any)?.lastMessage]);

  // Polling effect: request latest value for all subscribed nodes periodically
  useEffect(() => {
    // clear existing
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (subscriptions.length === 0) return;

    const id = window.setInterval(async () => {
      // fetch each subscribed node value
      const results = await Promise.all(
        subscriptions.map(async (s) => {
          try {
            const encodedUrl = encodeURIComponent(OPC_UA_URL);
            const encodedNodeId = encodeURIComponent(s.nodeId);
            const res = await fetch(`${REST_BACKEND_BASE}/node_value?url=${encodedUrl}&nodeid=${encodedNodeId}`);
            if (!res.ok) {
              const txt = await res.text().catch(() => "<no-body>");
              console.warn(`[OPCUAAddressSpace] node_value returned ${res.status} for ${s.nodeId}:`, txt);
              return { nodeId: s.nodeId, value: `error(${res.status})` };
            }
            // try json then text
            let payload: any = null;
            try {
              payload = await res.json();
            } catch {
              payload = await res.text();
            }
            const value = payload?.value ?? (typeof payload === "string" ? payload : JSON.stringify(payload));
            return { nodeId: s.nodeId, value: String(value) };
          } catch (err: any) {
            console.error("[OPCUAAddressSpace] poll error for", s.nodeId, err);
            return { nodeId: s.nodeId, value: `error(${err?.message ?? "network"})` };
          }
        })
      );

      // merge results into subscriptions state
      setSubscriptions((prev) =>
        prev.map((p) => {
          const r = results.find((x) => x.nodeId === p.nodeId);
          return r ? { ...p, value: r.value } : p;
        })
      );
    }, POLL_MS);

    pollRef.current = id;
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [subscriptions]);



  return (
    <div
      style={{
        position: "fixed",
        top: "1rem",
        right: "1rem",
        width: "750px",
        maxHeight: "80vh",
        zIndex: 9999,
        border: "1px solid #444",
        borderRadius: 8,
        overflow: "hidden",
        background: "#1b1b1b",
        boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#111",
          padding: "8px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 14,
        }}
      >
        <div>
          <strong>OPC UA Address Space</strong>
          <div style={{ fontSize: 11, color: "#888" }}>
            URL: <code>{OPC_UA_URL}</code>
          </div>
        </div>
        <button onClick={toggleOpen}>
          {isOpen ? "×" : "Adressraum öffnen"}
        </button>
      </div>
  
      {/* Inhalt */}
      {isOpen && (
        <div
          style={{
            padding: "8px 12px",
            maxHeight: "calc(80vh - 48px)",
            overflow: "auto",
            fontSize: 13,
            background: "#1b1b1b",
          }}
        >
          <style>{treeCss}</style>

          {!OPC_UA_URL && !loading && !error && (
            <div style={{ color: "#aaa" }}>
              Bitte verbinde dich zuerst mit einem OPC UA Server über die Connect Komponente.
            </div>
          )}

          {loading && (
            <div style={{ color: "#aaa" }}>
              Lade Address Space von <code>{OPC_UA_URL}</code> …
            </div>
          )}

          {!loading && error && (
            <div style={{ color: "#f66" }}>
              Fehler beim Laden des Address Space:
              <br />
              {error}
            </div>
          )}

          {!loading && !error && html && (
            // layout: left = tree, right = node info panel (space reserved for future widgets)
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div id="info-content" ref={containerRef} style={{ flex: 1 }} />

              <div
                style={{
                  width: 300,
                  minHeight: 160,
                  borderLeft: "1px solid #333",
                  paddingLeft: 12,
                  color: "#ddd",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong>Node Information</strong>
                  <button
                    onClick={() => setSelectedNode(null)}
                    style={{ background: "transparent", border: "1px solid #333", color: "#ccc", padding: "2px 6px", borderRadius: 4 }}
                  >
                    Clear
                  </button>
                </div>

                {!selectedNode && (
                  <div style={{ color: "#888", fontSize: 13 }}>
                    Klick auf einen Knoten, um Informationen anzuzeigen.
                    <div style={{ marginTop: 12, color: "#777", fontSize: 12 }}>
                      Platz für weitere Widgets (Methoden-Panel, Subscriptions, Properties).
                    </div>
                  </div>
                )}

                {selectedNode && (
                  <div style={{ fontSize: 13 }}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: "#aaa", fontSize: 12 }}>NodeId</div>
                      <div style={{ color: "#fff", wordBreak: "break-all" }}>{selectedNode.nodeId}</div>
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: "#aaa", fontSize: 12 }}>Attributes (dataset)</div>
                      <div style={{ marginTop: 6 }}>
                        {Object.keys(selectedNode.attributes).length === 0 && (
                          <div style={{ color: "#777" }}>Keine dataset-Attribute gefunden.</div>
                        )}
                        {Object.entries(selectedNode.attributes).map(([k, v]) => (
                          <div key={k} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                            <div style={{ color: "#999", minWidth: 110 }}>{k}</div>
                            <div style={{ color: "#fff", flex: 1 }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions / Subscribe */}
                    <div style={{ marginTop: 12, borderTop: "1px dashed #2b2b2b", paddingTop: 10 }}>
                      <div style={{ color: "#aaa", fontSize: 12, marginBottom: 6 }}>Actions / Details</div>
                      <div style={{ color: "#777", fontSize: 12 }}>
                        Buttons or widgets to call methods, subscribe, show properties, etc.
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <button 
                          style={{ padding: "6px 8px", marginRight: 8 }}
                          onClick={() => openMethodDialog(selectedNode)}
                        >
                          Call Method
                        </button>
                        <button
                          style={{ padding: "6px 8px", marginRight: 8 }}
                          onClick={() => {
                            addSubscription(selectedNode);
                          }}
                        >
                          Subscribe
                        </button>
                        <button
                          style={{ padding: "6px 8px" }}
                          onClick={() => {
                            addEventSubscription(selectedNode);
                          }}
                        >
                          Subscribe Events
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Subscriptions panel (always visible below node info) */}
                <div style={{ marginTop: 16, borderTop: "1px solid #2b2b2b", paddingTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong>Subscriptions</strong>
                    <div style={{ color: "#888", fontSize: 12 }}>{subscriptions.length} active</div>
                  </div>

                  {subscriptions.length === 0 && (
                    <div style={{ color: "#777", fontSize: 12 }}>Keine Abonnements. Wähle einen Knoten und klicke "Subscribe".</div>
                  )}

                  {subscriptions.map((s) => (
                    <div key={s.nodeId} style={{ marginBottom: 8, padding: "6px 8px", background: "#121212", borderRadius: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: "#999", fontSize: 11 }}>NodeId</div>
                          <div style={{ color: "#fff", fontSize: 13, wordBreak: "break-all" }}>{s.nodeId}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ color: "#999", fontSize: 11 }}>Value</div>
                          <div style={{ color: "#fff", fontSize: 13 }}>{s.value ?? "…"}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeSubscription(s.nodeId); }}
                          style={{ padding: "4px 8px" }}
                        >
                          Unsubscribe
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Event Subscriptions panel */}
                <div style={{ marginTop: 16, borderTop: "1px solid #2b2b2b", paddingTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong>Event Subscriptions</strong>
                    <div style={{ color: "#888", fontSize: 12 }}>{eventSubscriptions.length} active</div>
                  </div>

                  {eventSubscriptions.length === 0 && (
                    <div style={{ color: "#777", fontSize: 12 }}>Keine Event-Abonnements. Wähle einen Knoten und klicke "Subscribe Events".</div>
                  )}

                  {eventSubscriptions.map((s) => (
                    <div key={s.nodeId} style={{ marginBottom: 8, padding: "6px 8px", background: "#121012", borderRadius: 6 }}>
                      <div style={{ minWidth: 0, marginBottom: 6 }}>
                        <div style={{ color: "#999", fontSize: 11 }}>NodeId</div>
                        <div style={{ color: "#fff", fontSize: 13, wordBreak: "break-all" }}>{s.nodeId}</div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeEventSubscription(s.nodeId); }}
                          style={{ padding: "4px 8px" }}
                        >
                          Unsubscribe Events
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!loading && !error && !html && (
            <div style={{ color: "#888" }}>
              Noch keine Daten geladen (oder leerer Address Space).
            </div>
          )}        </div>
      )}

      {/* Method Call Dialog */}
      {methodDialogOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={closeMethodDialog}
        >
          <div
            style={{
              background: "#1b1b1b",
              border: "1px solid #444",
              borderRadius: 8,
              padding: "16px",
              minWidth: "400px",
              maxWidth: "600px",
              maxHeight: "80vh",
              overflow: "auto",
              color: "#f5f5f5",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Call Method</h3>
              <button
                onClick={closeMethodDialog}
                style={{ background: "transparent", border: "1px solid #333", color: "#ccc", padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            {methodNode && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "#aaa", fontSize: 12 }}>NodeId</div>
                <div style={{ color: "#fff", fontSize: 13, wordBreak: "break-all" }}>{methodNode.nodeId}</div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", color: "#ccc", fontSize: 13, marginBottom: 6 }}>
                Input Parameters (JSON)
              </label>
              <div style={{ color: "#888", fontSize: 11, marginBottom: 6 }}>
                Example: {`{"paramName": "value", "count": 42}`}
              </div>
              <textarea
                value={methodInputsJSON}
                onChange={(e) => setMethodInputsJSON(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: "100px",
                  padding: "8px",
                  background: "#121212",
                  border: "1px solid #333",
                  borderRadius: 4,
                  color: "#fff",
                  fontSize: 13,
                  fontFamily: "monospace",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                onClick={callMethod}
                style={{
                  padding: "8px 16px",
                  background: "#2a7fff",
                  border: "none",
                  borderRadius: 4,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Call Method
              </button>
              <button
                onClick={closeMethodDialog}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid #444",
                  borderRadius: 4,
                  color: "#ccc",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>

            {methodResult && (
              <div
                style={{
                  padding: "12px",
                  background: "#121212",
                  border: "1px solid #333",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 13,
                }}
              >
                <div style={{ color: "#aaa", fontSize: 12, marginBottom: 6 }}>Result</div>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{methodResult}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default OPCUAAddressSpace;