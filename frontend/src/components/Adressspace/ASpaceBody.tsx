import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { UaNode, UaStore } from "./types";
import { fetchChildren } from "./api";
import { updateNodeById, findNodeById, isLikelyExpandable, loadExpandedIds, collectExpandedIds, getNodeClassEmoji, upsertNodes, setChildren, setNodeState } from "./treeUtils";
import { Tree } from "antd";
import type { TreeDataNode } from "antd";
import { useLoading } from "../../contexts/LoadingContext";
import type { Key } from "react";
import type { TreeProps } from "antd";

type ASpaceBodyProps = {
  opcUaUrl: string;
  onNodeSelect: (node: UaNode) => void;
  addSubscription: (node: UaNode) => void;
  addEventSubscription: (node: UaNode) => void;
  openMethodDialog: (node: UaNode) => void;
};

const STORAGE_KEY_EXPANDED = "addressSpace_expandedNodes";

type LoadChildrenFn = (nodeId: string) => Promise<UaNode[]>;

export function buildTreeData(
  store: UaStore,
  onNodeSelect: (node: UaNode) => void,
  setSelectedKeys: (keys: string[]) => void,
  addSubscription: (node: UaNode) => void,
  addEventSubscription: (node: UaNode) => void,
  openMethodDialog: (node: UaNode) => void
): TreeDataNode[] {
  if (!store.rootId) return [];

  const build = (id: string): TreeDataNode => {
    const node = store.nodes.get(id);
    const st = store.stateById.get(id) ?? {};
    const childIds = store.childrenById.get(id);

    const hasChildrenKnown = Array.isArray(childIds);
    const children =
      hasChildrenKnown
        ? childIds!.map(build)
        : st.loaded
          ? []               // loaded but none
          : [];              // unknown yet; keep [] so expand arrow can show when you want

    return {
      key: id,
      title: node ? (
        <div
          style={{ display: "flex", alignItems: "center", gap: 2, overflow: 'hidden' }}
          onContextMenu={e => {
            e.preventDefault();
            setSelectedKeys([node.nodeId]);
            onNodeSelect(node);
          }}
          title={node.displayName + " " + node.nodeId}
        >
          <span style={{ minWidth: 200, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {getNodeClassEmoji(node.nodeClass)}{node.displayName}
          </span>
          {node.nodeClass.toLowerCase() === "variable" && <button onClick={() => addSubscription(node)} className="button-ghost break-keep">Subscribe</button>}
          {node.nodeClass.toLowerCase() === "object" && <button onClick={() => addEventSubscription(node)} className="button-ghost break-keep">Subscribe</button>}
          {node.nodeClass.toLowerCase() === "method" && <button onClick={() => openMethodDialog(node)} className="button-ghost break-keep">Call</button>}
        </div>
      ) : id,
      children: children,
      isLeaf: st.loaded && (childIds?.length ?? 0) === 0,
      selectable: true
    };
  };

  return [build(store.rootId)];
}

export const ASpaceBody: React.FC<ASpaceBodyProps> = ({
  opcUaUrl,
  addSubscription,
  addEventSubscription,
  openMethodDialog,
  onNodeSelect
}) => {
  const initialRoot: UaNode = {
    nodeId: "i=84",
    displayName: "Root",
    browseName: "0:RootFolder",
    nodeClass: "Object",
    children: [],
    loaded: true,
    expanded: true,
    loading: false,
  };

  const [store, setStore] = useState<UaStore>(() => ({
    rootId: initialRoot.nodeId,
    nodes: new Map([[initialRoot.nodeId, initialRoot]]),
    childrenById: new Map(),
    stateById: new Map([[initialRoot.nodeId, { loaded: false, loading: false }]]),
  }));

  const [expandedKeys, setExpandedKeys] = useState<Key[]>(() => {
    const saved = loadExpandedIds(STORAGE_KEY_EXPANDED);
    return Array.from(saved);
  });
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);

  useEffect(() => {
    if (expandedKeys.length > 0) {
      localStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify(expandedKeys));
    }
  }, [expandedKeys]);

  const treeData = useMemo(
    () => buildTreeData(store, onNodeSelect, setSelectedKeys, addSubscription, addEventSubscription, openMethodDialog),
    [store, onNodeSelect, addSubscription, addEventSubscription, openMethodDialog]
  );

  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());

  const loadChildren: LoadChildrenFn = useCallback(
    (nodeId: string) => fetchChildren(opcUaUrl, nodeId),
    [opcUaUrl]
  );

  // Load root children and restore expanded state on mount
  useEffect(() => {
    if (!opcUaUrl) return;

    const loadRootAndExpanded = async () => {
      const savedExpanded = loadExpandedIds(STORAGE_KEY_EXPANDED);
      
      // Load root children first
      const loadNode = async (nodeId: string) => {
        const st = store.stateById.get(nodeId);
        if (st?.loaded) return;

        try {
          const children = await loadChildren(nodeId);

          setStore((prev) => {
            let next = upsertNodes(prev, children);
            next = setChildren(next, nodeId, children.map((c) => c.nodeId));
            next = setNodeState(next, nodeId, { loaded: true, loading: false });

            for (const c of children) {
              if (!next.stateById.get(c.nodeId)) {
                next = setNodeState(next, c.nodeId, { loaded: false, loading: false });
              }
            }
            return next;
          });

          // Recursively load expanded children
          for (const child of children) {
            if (savedExpanded.has(child.nodeId)) {
              await loadNode(child.nodeId);
            }
          }
        } catch (e) {
          console.error(`Failed to load node ${nodeId}:`, e);
        }
      };

      await loadNode("i=84");
      
      // Set expanded keys after loading
      if (savedExpanded.size > 0) {
        setExpandedKeys(Array.from(savedExpanded));
      }
    };

    loadRootAndExpanded();
  }, [opcUaUrl, loadChildren]);

const onSelect: TreeProps["onSelect"] = useCallback(
    (keys, info) => {
      setSelectedKeys(keys);

      const id = (keys[0] as string) ?? null;
      if (!id) return;

      const node = store.nodes.get(id);
      if (node) onNodeSelect(node);
    },
    [store.nodes, onNodeSelect]
  );

  const onExpand: TreeProps["onExpand"] = useCallback((keys) => {
    setExpandedKeys(keys);
  }, []);

  const loadData: TreeProps["loadData"] = useCallback(
    async (treeNode) => {
      const id = treeNode.key as string;

      // already loaded?
      const st = store.stateById.get(id);
      if (st?.loaded) return;

      // de-dupe inflight
      const existing = inflightRef.current.get(id);
      if (existing) return existing;

      const p = (async () => {
        setStore((prev) => setNodeState(prev, id, { loading: true }));

        try {
          const children = await loadChildren(id);

          setStore((prev) => {
            // upsert nodes
            let next = upsertNodes(prev, children);

            // connect parent -> children ids
            next = setChildren(next, id, children.map((c) => c.nodeId));

            // mark loaded/loading flags
            next = setNodeState(next, id, { loaded: true, loading: false });

            // ensure children have default state entries (optional but nice)
            for (const c of children) {
              if (!next.stateById.get(c.nodeId)) {
                next = setNodeState(next, c.nodeId, { loaded: false, loading: false });
              }
            }
            return next;
          });
        } catch (e) {
          setStore((prev) => setNodeState(prev, id, { loaded: true, loading: false }));
        } finally {
          inflightRef.current.delete(id);
        }
      })();

      inflightRef.current.set(id, p);
      return p;
    },
    [store.stateById, loadChildren]
  );

  return (
      <Tree
        className="address-space-tree"
        treeData={treeData}
        expandedKeys={expandedKeys}
        selectedKeys={selectedKeys}
        onExpand={onExpand}
        onSelect={onSelect}
        loadData={loadData}
        showLine={{ showLeafIcon: false }}
        // Optionally, you can set showIcon={true} if you want
        style={{
          background: "rgb(var(--panel))",
          color: "rgb(var(--fg))",
          borderRadius: 0,
          padding: "0.5rem 0.5rem 0.5rem 0.5rem"
        }}
      />
  );
};