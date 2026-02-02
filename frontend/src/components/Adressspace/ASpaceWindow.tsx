// ASpaceWindow.tsx - Resizable, draggable window with state persistence (Performance Optimized)

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useUrlContext } from "../../contexts/UrlContext";
import { useSocket } from "../../hooks/use-socket";
import { ASpaceBody } from "./ASpaceBody";
import { UaNode } from "./types";
import { useSubscriptions, useEventSubscriptions, useMethodCall } from "./hooks";
import { SubscriptionsPanel, EventsPanel, MethodDialog, NodeDetailsPanel } from "./panels";

// LocalStorage keys
const STORAGE_KEY_WINDOW = "addressSpace_window";
const STORAGE_KEY_EXPANDED = "addressSpace_expandedNodes";

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}


const DEFAULT_WINDOW: WindowState = {
  x: window.innerWidth - 520,
  y: 60,
  width: 500,
  height: 500,
};

export function ASpaceWindow(){
  const { url: opcUaUrl } = useUrlContext();
  const socket = useSocket();
  const [selectedNode, setSelectedNode] = useState<UaNode | null>(null);

  // Key to force ASpaceBody re-mount (for reload functionality)
  const [bodyKey, setBodyKey] = useState(0);

  // Clear tree state on page reload (runs once on mount)
  useEffect(() => {
    localStorage.removeItem(STORAGE_KEY_EXPANDED);
  }, []);

  // ========== HOOKS ==========
  const { subscriptions, addSubscription, removeSubscription } = useSubscriptions(opcUaUrl, (socket as any));
  const { eventSubscriptions, addEventSubscription, removeEventSubscription } = useEventSubscriptions(opcUaUrl, (socket as any));
  const { 
    isOpen: methodDialogOpen, 
    methodNode, 
    inputs, 
    inputValues,
    result: methodResult,
    isLoading: methodLoading,
    openMethodDialog, 
    closeMethodDialog, 
    setInputValue, 
    callMethod 
  } = useMethodCall(opcUaUrl, (socket as any));

  // Window state
  const [windowState, setWindowState] = useState<WindowState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_WINDOW);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_WINDOW;
      }
    }
    return DEFAULT_WINDOW;
  });

  // Dragging state - use refs for offset to avoid re-renders
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Resizing state
  const [isResizing, setIsResizing] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);

  // Save window state ONLY on minimize toggle (not during drag/resize)
  const saveWindowState = useCallback((state: WindowState) => {
    localStorage.setItem(STORAGE_KEY_WINDOW, JSON.stringify(state));
  }, []);

  // Handle node selection
  const handleNodeSelect = (node: UaNode) => {
    setSelectedNode(node);
  };

  // ========== DRAGGING ==========
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.resize-handle')) return;
    setIsDragging(true);
    dragOffsetRef.current = {
      x: e.clientX - windowState.x,
      y: e.clientY - windowState.y,
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      setWindowState(prev => ({
        ...prev,
        x: Math.max(0, Math.min(window.innerWidth - prev.width, e.clientX - dragOffsetRef.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffsetRef.current.y)),
      }));
    }
    if (isResizing) {
      setWindowState(prev => ({
        ...prev,
        width: Math.max(300, e.clientX - prev.x),
        height: Math.max(200, e.clientY - prev.y),
      }));
    }
  }, [isDragging, isResizing]);

  // Save to localStorage only when drag/resize ENDS
  const handleMouseUp = useCallback(() => {
    if (isDragging || isResizing) {
      // Save final position/size to localStorage
      setWindowState(prev => {
        saveWindowState(prev);
        return prev;
      });
    }
    setIsDragging(false);
    setIsResizing(false);
  }, [isDragging, isResizing, saveWindowState]);

  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  // Reload/Reset tree (clears state and forces re-mount)
  const handleReload = () => {
    localStorage.removeItem(STORAGE_KEY_EXPANDED);
    setBodyKey(prev => prev + 1); // Force ASpaceBody to re-mount
  };


  return (
    <div
      className="relative w-full h-full bg-gray-100 shadow-lg overflow-auto border-b-2 border-black"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}
    >
      {/* Header - Draggable */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          background: "linear-gradient(to bottom, #2a2a2a, #1a1a1a)",
          padding: "8px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: isDragging ? "grabbing" : "grab",
          borderBottom: "1px solid #333",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>🌳</span>
          <div>
            <strong style={{ color: "#fff", fontSize: 13 }}>Address Space</strong>
            <div style={{ fontSize: 10, color: "#666" }}>
              {opcUaUrl ? opcUaUrl.substring(0, 35) + "..." : "not connected"}
            </div>
          </div>
        </div>
        
        <div style={{ display: "flex", gap: 4 }}>
          {/* Reload (resets tree state) */}
          <button
            onClick={handleReload}
            style={{
              background: "#363",
              border: "none",
              color: "#fff",
              width: 24,
              height: 24,
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
            title="Reload tree (reset)"
          >
            ↻
          </button>

        </div>
      </div>

      {/* Body */}
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            background: "#1a1a1a",
          }}
        >
          {!opcUaUrl ? (
            <div style={{ color: "#888", padding: 20, textAlign: "center", flex: 1 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔌</div>
              <div>Please connect to an OPC UA server first</div>
            </div>
          ) : (
            <>
              {/* Left: Tree */}
              <div style={{ flex: 1, overflow: "auto", padding: "8px 12px", borderRight: "1px solid #333" }}>
                <ASpaceBody key={bodyKey} opcUaUrl={opcUaUrl} onNodeSelect={handleNodeSelect} />
              </div>

              {/* Right: Panels */}
              <div style={{ width: 260, overflow: "auto", padding: "8px 12px", color: "#ddd" }}>
                {/* Selected Node Info */}
                {selectedNode ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Selected Node</div>
                    <div style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>
                      {selectedNode.displayName}
                    </div>
                    <div style={{ fontSize: 10, color: "#666", marginTop: 2, wordBreak: "break-all" }}>
                      {selectedNode.nodeId}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        padding: "2px 6px",
                        background: "#333",
                        borderRadius: 3,
                        display: "inline-block",
                        fontSize: 10,
                        color: "#aaa",
                      }}
                    >
                      {selectedNode.nodeClass}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <button
                        onClick={() => addSubscription(selectedNode)}
                        disabled={selectedNode.nodeClass.toLowerCase() !== "variable"}
                        style={{
                          padding: "4px 8px",
                          fontSize: 11,
                          background: selectedNode.nodeClass.toLowerCase() === "variable" ? "#2a5" : "#333",
                          border: "none",
                          borderRadius: 4,
                          color: "#fff",
                          cursor: selectedNode.nodeClass.toLowerCase() === "variable" ? "pointer" : "not-allowed",
                        }}
                      >
                        Subscribe
                      </button>
                      <button
                        onClick={() => addEventSubscription(selectedNode)}
                        disabled={selectedNode.nodeClass.toLowerCase() !== "object"}
                        style={{
                          padding: "4px 8px",
                          fontSize: 11,
                          background: selectedNode.nodeClass.toLowerCase() === "object" ? "#a52" : "#333",
                          border: "none",
                          borderRadius: 4,
                          color: "#fff",
                          cursor: selectedNode.nodeClass.toLowerCase() === "object" ? "pointer" : "not-allowed",
                        }}
                      >
                        Events
                      </button>
                      <button
                        onClick={() => openMethodDialog(selectedNode)}
                        disabled={selectedNode.nodeClass.toLowerCase() !== "method"}
                        style={{
                          padding: "4px 8px",
                          fontSize: 11,
                          background: selectedNode.nodeClass.toLowerCase() === "method" ? "#25a" : "#333",
                          border: "none",
                          borderRadius: 4,
                          color: "#fff",
                          cursor: selectedNode.nodeClass.toLowerCase() === "method" ? "pointer" : "not-allowed",
                        }}
                      >
                        Call
                      </button>
                    </div>

                    {/* Node Details Panel (Properties + References) */}
                    <NodeDetailsPanel node={selectedNode} opcUaUrl={opcUaUrl} />
                  </div>
                ) : (
                  <div style={{ color: "#777", fontSize: 12, marginBottom: 12 }}>
                    Rechtsklick auf einen Knoten zur Auswahl.
                  </div>
                )}

                {/* Subscriptions Panel */}
                <SubscriptionsPanel
                  subscriptions={subscriptions}
                  onRemove={removeSubscription}
                />

                {/* Events Panel */}
                <EventsPanel
                  eventSubscriptions={eventSubscriptions}
                  onRemove={removeEventSubscription}
                />
              </div>
            </>
          )}
        </div>

      {/* Method Dialog */}
      <MethodDialog
        isOpen={methodDialogOpen}
        node={methodNode}
        inputs={inputs}
        inputValues={inputValues}
        result={methodResult}
        isLoading={methodLoading}
        onInputChange={setInputValue}
        onCall={callMethod}
        onClose={closeMethodDialog}
      />
    </div>
  );
};

export default ASpaceWindow;
