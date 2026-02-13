import type { TreeDataNode } from 'antd';
import type { TreeProps } from 'antd';
import { Tree } from 'antd';
import type { Key } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchChildren } from './api';
import {
  getNodeClassEmoji,
  loadExpandedIds,
  setChildren,
  setNodeState,
  upsertNodes,
} from './treeUtils';
import type { UaNode, UaStore } from './types';

interface ASpaceBodyProps {
  opcUaUrl: string;
  onNodeSelect: (node: UaNode) => void;
  addSubscription: (node: UaNode) => void;
  addEventSubscription: (node: UaNode) => void;
  openMethodDialog: (node: UaNode) => void;
}

const STORAGE_KEY_EXPANDED = 'addressSpace_expandedNodes';

export function buildTreeData(
  store: UaStore,
  onNodeSelect: (node: UaNode) => void,
  setSelectedKeys: (keys: string[]) => void,
  addSubscription: (node: UaNode) => void,
  addEventSubscription: (node: UaNode) => void,
  openMethodDialog: (node: UaNode) => void,
): TreeDataNode[] {
  if (!store.rootId) return [];

  const build = (id: string): TreeDataNode => {
    const node = store.nodes.get(id);
    const st = store.stateById.get(id) ?? {};
    const childIds = store.childrenById.get(id);

    const hasChildrenKnown = Array.isArray(childIds);
    const children = hasChildrenKnown ? childIds.map(build) : [];

    return {
      key: id,
      title: node ? (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden' }}
          onContextMenu={(e) => {
            e.preventDefault();
            setSelectedKeys([node.nodeId]);
            onNodeSelect(node);
          }}
          title={node.displayName + ' ' + node.nodeId}
        >
          <span
            style={{
              minWidth: 200,
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {getNodeClassEmoji(node.nodeClass)}
            {node.displayName}
          </span>
          {node.nodeClass.toLowerCase() === 'variable' && (
            <button onClick={() => addSubscription(node)} className="button-ghost break-keep">
              Subscribe
            </button>
          )}
          {node.nodeClass.toLowerCase() === 'object' && (
            <button onClick={() => addEventSubscription(node)} className="button-ghost break-keep">
              Subscribe
            </button>
          )}
          {node.nodeClass.toLowerCase() === 'method' && (
            <button onClick={() => openMethodDialog(node)} className="button-ghost break-keep">
              Call
            </button>
          )}
        </div>
      ) : (
        id
      ),
      children: children,
      isLeaf: !!st.loaded && (childIds?.length ?? 0) === 0,
      selectable: true,
    };
  };

  return [build(store.rootId)];
}

export const ASpaceBody: React.FC<ASpaceBodyProps> = ({
  opcUaUrl,
  addSubscription,
  addEventSubscription,
  openMethodDialog,
  onNodeSelect,
}) => {
  const initialRoot: UaNode = {
    nodeId: 'i=84',
    displayName: 'Root',
    browseName: '0:RootFolder',
    nodeClass: 'Object',
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

  const treeData = useMemo(
    () =>
      buildTreeData(
        store,
        onNodeSelect,
        setSelectedKeys,
        addSubscription,
        addEventSubscription,
        openMethodDialog,
      ),
    [store, onNodeSelect, addSubscription, addEventSubscription, openMethodDialog],
  );

  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());

  useEffect(() => {
    if (!opcUaUrl) return;
    const saved = Array.from(loadExpandedIds(STORAGE_KEY_EXPANDED));
    setExpandedKeys(saved);
  }, [opcUaUrl]);

  useEffect(() => {
    if (expandedKeys.length > 0) {
      localStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify(expandedKeys));
    }
  }, [expandedKeys]);

  const onSelect: TreeProps['onSelect'] = useCallback(
    (keys: Key[]) => {
      setSelectedKeys(keys);

      const id = (keys[0] as string) ?? null;
      if (!id) return;

      const node = store.nodes.get(id);
      if (node) onNodeSelect(node);
    },
    [store.nodes, onNodeSelect],
  );

  const onExpand: TreeProps['onExpand'] = useCallback((keys: Key[]) => {
    setExpandedKeys(keys);
  }, []);

  const loadChildren = useCallback((nodeId: string) => fetchChildren(opcUaUrl, nodeId), [opcUaUrl]);

  const loadData: TreeProps['loadData'] = useCallback(
    async (treeNode: any) => {
      const id = treeNode.key as string;
      const st = store.stateById.get(id);
      if (st?.loaded) return;
      const existing = inflightRef.current.get(id);
      if (existing) return existing;
      const p = (async () => {
        setStore((prev) => setNodeState(prev, id, { loading: true }));
        try {
          const children = await loadChildren(id);

          setStore((prev) => {
            let next = upsertNodes(prev, children);
            next = setChildren(
              next,
              id,
              children.map((c) => c.nodeId),
            );
            next = setNodeState(next, id, { loaded: true, loading: false });
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
    [store.stateById, loadChildren],
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
        background: 'rgb(var(--panel))',
        color: 'rgb(var(--fg))',
        borderRadius: 0,
        padding: '0.5rem 0.5rem 0.5rem 0.5rem',
      }}
    />
  );
};
