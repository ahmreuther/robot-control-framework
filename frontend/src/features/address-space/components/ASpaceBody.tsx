import type { TreeDataNode } from 'antd';
import type { TreeProps } from 'antd';
import { Tree } from 'antd';
import type { Key } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchChildren, fetchRootNode } from '../api/addressSpaceApi';
import {
  getNodeClassEmoji,
  loadExpandedIds,
  setChildren,
  setNodeState,
  upsertNodes,
} from '../model/treeUtils';
import type { UaNode, UaStore } from '../model/types';

interface ASpaceBodyProps {
  opcUaUrl: string;
  onNodeSelect: (node: UaNode) => void;
  addSubscription: (node: UaNode) => void;
  addEventSubscription: (node: UaNode) => void;
  openMethodDialog: (node: UaNode) => void;
  onRemoveEvent: (nodeId: string) => void;
  onRemoveSubscription: (nodeId: string) => void;
  subscriptions: Array<{ nodeId: string }>;
  eventSubscriptions: Array<{ nodeId: string }>;
}

const STORAGE_KEY_EXPANDED_PREFIX = 'addressSpace_expandedNodes:';

export function buildTreeData(
  store: UaStore,
  onNodeSelect: (node: UaNode) => void,
  setSelectedKeys: (keys: string[]) => void,
  addSubscription: (node: UaNode) => void,
  addEventSubscription: (node: UaNode) => void,
  openMethodDialog: (node: UaNode) => void,
  onRemoveSubscription: (nodeId: string) => void,
  onRemoveEvent: (nodeId: string) => void,
  subscriptions: Array<{ nodeId: string }>,
  eventSubscriptions: Array<{ nodeId: string }>,
): TreeDataNode[] {
  if (!store.rootId) return [];

  const build = (id: string): TreeDataNode => {
    const node = store.nodes.get(id);
    const st = store.stateById.get(id) ?? {};
    const childIds = store.childrenById.get(id);

    const hasChildrenKnown = Array.isArray(childIds);
    const children = hasChildrenKnown ? childIds.map(build) : [];

    const isSubscribed = subscriptions.some((s) => s.nodeId === id);
    const isEventSubscribed = eventSubscriptions.some((s) => s.nodeId === id);

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
            <button
              onClick={() => {
                if (isSubscribed) {
                  onRemoveSubscription(node.nodeId);
                } else {
                  addSubscription(node);
                }
              }}
              className="button-ghost break-keep"
            >
              {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
            </button>
          )}
          {node.nodeClass.toLowerCase() === 'object' && (
            <button
              onClick={() => {
                if (isEventSubscribed) {
                  onRemoveEvent(node.nodeId);
                } else {
                  addEventSubscription(node);
                }
              }}
              className="button-ghost break-keep"
            >
              {isEventSubscribed ? 'Unsubscribe' : 'Subscribe'}
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
  onRemoveEvent,
  onRemoveSubscription,
  subscriptions,
  eventSubscriptions,
}) => {
  const expandedStorageKey = `${STORAGE_KEY_EXPANDED_PREFIX}${encodeURIComponent(opcUaUrl)}`;

  const makeStore = (root: UaNode | null): UaStore =>
    root
      ? {
          rootId: root.nodeId,
          nodes: new Map([[root.nodeId, root]]),
          childrenById: new Map(),
          stateById: new Map([[root.nodeId, { loaded: false, loading: false }]]),
        }
      : {
          rootId: null,
          nodes: new Map(),
          childrenById: new Map(),
          stateById: new Map(),
        };

  const [store, setStore] = useState<UaStore>(() => makeStore(null));

  const [expandedKeys, setExpandedKeys] = useState<Key[]>(() => {
    const saved = loadExpandedIds(expandedStorageKey);
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
        onRemoveSubscription,
        onRemoveEvent,
        subscriptions,
        eventSubscriptions,
      ),
    [
      store,
      onNodeSelect,
      addSubscription,
      addEventSubscription,
      openMethodDialog,
      onRemoveSubscription,
      onRemoveEvent,
      subscriptions,
      eventSubscriptions,
    ],
  );

  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());

  useEffect(() => {
    if (!opcUaUrl) return;
    let cancelled = false;

    const saved = Array.from(loadExpandedIds(expandedStorageKey));
    setExpandedKeys(saved);
    inflightRef.current.clear();

    (async () => {
      try {
        const root = await fetchRootNode(opcUaUrl);
        if (cancelled) return;
        setStore(makeStore(root));
        setSelectedKeys([]);
      } catch (e) {
        if (cancelled) return;
        setStore(makeStore(null));
        setSelectedKeys([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [opcUaUrl, expandedStorageKey]);

  useEffect(() => {
    localStorage.setItem(expandedStorageKey, JSON.stringify(expandedKeys));
  }, [expandedKeys, expandedStorageKey]);

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
    async (treeNode: { key: Key }) => {
      const id = String(treeNode.key);
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
