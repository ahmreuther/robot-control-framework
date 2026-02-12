import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { UaNode } from "./types";
import { fetchChildren } from "./api";
import { updateNodeById, findNodeById, isLikelyExpandable, loadExpandedIds, collectExpandedIds, getNodeClassEmoji } from "./treeUtils";
import { Tree } from "antd";
import type { TreeDataNode } from "antd";
import { useLoading } from "../../contexts/LoadingContext";

type ASpaceBodyProps = {
  opcUaUrl: string;
  onNodeSelect: (node: UaNode) => void;
  addSubscription: (node: UaNode) => void;
  addEventSubscription: (node: UaNode) => void;
  openMethodDialog: (node: UaNode) => void;
};

const STORAGE_KEY_EXPANDED = "addressSpace_expandedNodes";

export const uaNodeToTreeData = (
  node: UaNode,
  onNodeSelect: (node: UaNode) => void,
  setSelectedKeys: (keys: string[]) => void,
  addSubscription: (node: UaNode) => void,
  addEventSubscription: (node: UaNode) => void,
  openMethodDialog: (node: UaNode) => void
): TreeDataNode => {
  return {
    title: (
      <div
        style={{ display: "flex", alignItems: "center", gap: 2, overflow: 'hidden' }}
        onContextMenu={e => {
          e.preventDefault();
          setSelectedKeys([node?.nodeId]);
          onNodeSelect(node);
        }}
        title={node?.displayName + " " + node?.nodeId}
      >
        <span style={{ minWidth: 200, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getNodeClassEmoji(node?.nodeClass)}{node?.displayName}</span>
        {node?.nodeClass.toLowerCase() == "variable" && <button onClick={() => addSubscription(node)} className="button-ghost break-keep">Subscribe</button>}
        {node?.nodeClass.toLowerCase() == "object" && <button onClick={() => addEventSubscription(node)} className="button-ghost break-keep">Subscribe</button>}
        {node?.nodeClass.toLowerCase() == "method" && <button onClick={() => openMethodDialog(node)} className="button-ghost break-keep">Call</button>}
      </div>
    ),
    key: node?.nodeId,
    children: node?.children?.map(c => uaNodeToTreeData(c, onNodeSelect, setSelectedKeys, addSubscription, addEventSubscription, openMethodDialog)),
    isLeaf: !isLikelyExpandable(node),
    selectable: true
  };
};

export const ASpaceBody: React.FC<ASpaceBodyProps> = ({ opcUaUrl, onNodeSelect, addSubscription, addEventSubscription, openMethodDialog }) => {
  const [root, setRoot] = useState<UaNode | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const { executeWithLoading } = useLoading();

  
  const expandedIdsRef = useRef<Set<string>>(loadExpandedIds(STORAGE_KEY_EXPANDED));

  useEffect(() => {
    if (!root) return;
    const ids = collectExpandedIds(root);
    localStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify(ids));
    setExpandedKeys(ids);
  }, [root]);

  const loadExpandedChildren = useCallback(async (
    nodeId: string,
    savedExpanded: Set<string>
  ): Promise<UaNode[]> => {
    const children = await executeWithLoading(
      `Loading children of ${nodeId}`,
      () => fetchChildren(opcUaUrl, nodeId),
      {
        errorMessage: `Failed to load children for node ${nodeId} from ${opcUaUrl}`,
      }
    );
    
    const childrenWithState = await Promise.all(
      children.map(async (child) => {
        const shouldExpand = savedExpanded.has(child.nodeId);
        if (shouldExpand && isLikelyExpandable(child)) {
          try {
            const grandchildren = await loadExpandedChildren(child.nodeId, savedExpanded);
            return {
              ...child,
              expanded: true,
              loaded: true,
              loading: false,
              children: grandchildren,
            };
          } catch (e) {
            return { ...child, expanded: false };
          }
        }
        return { ...child, expanded: false };
      })
    );
    return childrenWithState;
  }, [opcUaUrl, executeWithLoading]);

  useEffect(() => {
    if (!opcUaUrl) return;
    const loadRoot = async () => {
      const savedExpanded = expandedIdsRef.current;
      const children = await executeWithLoading(
        "Loading address space root",
        () => loadExpandedChildren("i=84", savedExpanded),  //TODO HArd coded Root? 
        {
          errorMessage: `Failed to load address space root from ${opcUaUrl}`,
        }
      );
      
      setRoot({
        nodeId: "i=84",
        displayName: "Root",
        browseName: "0:RootFolder",
        nodeClass: "Object",
        children,
        loaded: true,
        expanded: savedExpanded.has("i=84") || savedExpanded.size === 0,
        loading: false,
      });
    };
    
    loadRoot().catch(() => {
      setRoot(null);
    });
  }, [opcUaUrl, loadExpandedChildren, executeWithLoading]);

  const onExpand = useCallback(async (keys: React.Key[], { expanded, node }) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
    if (expanded && node) {
      const nodeId = node.key as string;
      if (root) {
        const found = findNodeById(root, nodeId);
        if (found && !found.loaded && !found.loading) {
          setRoot((prev) => {
            if (!prev) return prev;
            return updateNodeById(prev, nodeId, (n) => ({
              ...n,
              expanded: true,
              loading: true,
            }));
          });
          
          try {
            const childrenWithState = await loadExpandedChildren(nodeId, expandedIdsRef.current);
            setRoot((prev) => {
              if (!prev) return prev;
              return updateNodeById(prev, nodeId, (n) => ({
                ...n,
                children: childrenWithState,
                loaded: true,
                loading: false,
              }));
            });
          } catch (e) {
            setRoot((prev) => {
              if (!prev) return prev;
              return updateNodeById(prev, nodeId, (n) => ({
                ...n,
                loading: false,
                loaded: true,
                children: n.children ?? [],
              }));
            });
          }
        }
      }
    }
  }, [root, loadExpandedChildren]);
 
function buildNodeIndex(root: UaNode | null): Map<string, UaNode> {
  const map = new Map<string, UaNode>();
  if (!root) return map;

  const stack: UaNode[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    map.set(n.nodeId, n);
    if (n.children?.length) stack.push(...n.children);
  }
  return map;
}

const nodeIndex = useMemo(() => buildNodeIndex(root ?? null), [root]);

 const setSelectTree = useCallback(
  (selectedKeys: React.Key[]) => {
    const keys = selectedKeys as string[];
    setSelectedKeys(keys);

    const id = keys[0];
    if (!id) return;

    const node = nodeIndex.get(id);
    if (node) onNodeSelect(node);
  },
  [nodeIndex, onNodeSelect]
);


  const treeData: TreeDataNode[] = useMemo(() => [uaNodeToTreeData(root, onNodeSelect, setSelectedKeys, addSubscription, addEventSubscription, openMethodDialog)], [root, onNodeSelect, setSelectedKeys, addSubscription, addEventSubscription, openMethodDialog]);

  return (
      <Tree
        className="address-space-tree"
        treeData={treeData}
        expandedKeys={expandedKeys}
        autoExpandParent={autoExpandParent}
        selectedKeys={selectedKeys}
        onExpand={onExpand}
        onSelect={setSelectTree}
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