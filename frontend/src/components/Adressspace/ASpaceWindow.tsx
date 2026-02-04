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
    <section className="panel h-full">
      <header className="panel-header">
        <div className="panel-title flex">Addressspace 
          <div className="ml-2" style={{ fontSize: 10, color: "#666" }}>
            {opcUaUrl ? opcUaUrl: "not connected"}
          </div>
        </div>
        <button
          onClick={handleReload} 
          className="button-ghost"
          title="Reload tree (reset)"
        >
          ↻
        </button>
      </header>
        {opcUaUrl &&
          <div className="panel-body flex h-full min-h-0 flex-col">
            <div className="panel flex-1 min-h-0 overflow-auto">
            <ASpaceBody key={bodyKey} opcUaUrl={opcUaUrl} onNodeSelect={handleNodeSelect} />
            </div>
          </div>
        }
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
    </section>
  );
};

export default ASpaceWindow;
