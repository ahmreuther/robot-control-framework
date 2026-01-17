// ASpaceWindow.tsx - Resizable, draggable window with state persistence

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useUrlContext } from "../UrlContext";
import { ASpaceBody } from "./ASpaceBody";
import { UaNode } from "./types";

// LocalStorage keys
const STORAGE_KEY_WINDOW = "addressSpace_window";
const STORAGE_KEY_TREE = "addressSpace_treeState";

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
}

interface ASpaceWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_WINDOW: WindowState = {
  x: window.innerWidth - 520,
  y: 60,
  width: 500,
  height: 500,
  minimized: false,
};

export const ASpaceWindow: React.FC<ASpaceWindowProps> = ({ isOpen, onClose }) => {
  const { url: opcUaUrl } = useUrlContext();
  const [selectedNode, setSelectedNode] = useState<UaNode | null>(null);
  
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

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Resizing state
  const [isResizing, setIsResizing] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);

  // Save window state on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WINDOW, JSON.stringify(windowState));
  }, [windowState]);

  // Handle node selection
  const handleNodeSelect = (node: UaNode) => {
    setSelectedNode(node);
  };

  // ========== DRAGGING ==========
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.resize-handle')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - windowState.x,
      y: e.clientY - windowState.y,
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      setWindowState(prev => ({
        ...prev,
        x: Math.max(0, Math.min(window.innerWidth - prev.width, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffset.y)),
      }));
    }
    if (isResizing) {
      setWindowState(prev => ({
        ...prev,
        width: Math.max(300, e.clientX - prev.x),
        height: Math.max(200, e.clientY - prev.y),
      }));
    }
  }, [isDragging, isResizing, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

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

  // ========== RESIZE HANDLE ==========
  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
  };

  // Toggle minimize
  const toggleMinimize = () => {
    setWindowState(prev => ({ ...prev, minimized: !prev.minimized }));
  };

  if (!isOpen) return null;

  return (
    <div
      ref={windowRef}
      style={{
        position: "fixed",
        left: windowState.x,
        top: windowState.y,
        width: windowState.width,
        height: windowState.minimized ? "auto" : windowState.height,
        zIndex: 9999,
        border: "1px solid #555",
        borderRadius: 8,
        overflow: "hidden",
        background: "#1a1a1a",
        boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
        display: "flex",
        flexDirection: "column",
      }}
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
          {/* Minimize */}
          <button
            onClick={toggleMinimize}
            style={{
              background: "#444",
              border: "none",
              color: "#fff",
              width: 24,
              height: 24,
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
            title={windowState.minimized ? "Expand" : "Minimize"}
          >
            {windowState.minimized ? "□" : "−"}
          </button>
          
          {/* Close */}
          <button
            onClick={onClose}
            style={{
              background: "#633",
              border: "none",
              color: "#fff",
              width: 24,
              height: 24,
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Body */}
      {!windowState.minimized && (
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "8px 12px",
            background: "#1a1a1a",
          }}
        >
          {!opcUaUrl ? (
            <div style={{ color: "#888", padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔌</div>
              <div>Please connect to an OPC UA server first</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                Use the OPC-UA tab → Connect
              </div>
            </div>
          ) : (
            <>
              <ASpaceBody opcUaUrl={opcUaUrl} onNodeSelect={handleNodeSelect} />
              
              {/* Selected Node Info */}
              {selectedNode && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 10,
                    background: "#252525",
                    borderRadius: 6,
                    border: "1px solid #333",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Selected Node</div>
                  <div style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>
                    {selectedNode.displayName}
                  </div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
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
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Resize Handle */}
      {!windowState.minimized && (
        <div
          className="resize-handle"
          onMouseDown={handleResizeStart}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: 16,
            height: 16,
            cursor: "se-resize",
            background: "linear-gradient(135deg, transparent 50%, #444 50%)",
            borderBottomRightRadius: 6,
          }}
        />
      )}
    </div>
  );
};

export default ASpaceWindow;
