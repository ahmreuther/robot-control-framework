import React, { useEffect, useState, useCallback, useRef } from "react";
import { UaNode } from "./types";
import { fetchChildren } from "./api";
import { updateNodeById, findNodeById, isLikelyExpandable } from "./treeUtils";
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

const getNodeClassEmoji = (nodeClass: string): string => {
  switch ((nodeClass ?? "").toLowerCase()) {
    case "object":
      return "🔴";
    case "variable":
      return "🔢";
    case "method":
      return "(x)";
    case "view":
      return "🧱";
    case "objecttype":
      return "🔢📏";
    case "variabletype":
      return "🔗";
    case "referencetype":
      return "💾";
    case "datatype":
      return "👁️";
    default:
      return "🚫";
  }
};

const collectExpandedIds = (node: UaNode): string[] => {
  const ids: string[] = [];
  if (node.expanded) ids.push(node.nodeId);
  node.children?.forEach(c => ids.push(...collectExpandedIds(c)));
  return ids;
};

const loadExpandedIds = (): Set<string> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_EXPANDED);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
};

const uaNodeToTreeData = (
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

  const expandedIdsRef = useRef<Set<string>>(loadExpandedIds());

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

//root laden

  useEffect(() => {
    if (!opcUaUrl) return;
    const loadRoot = async () => {
      const savedExpanded = expandedIdsRef.current;
      const children = await executeWithLoading(
        "Loading address space root",
        () => loadExpandedChildren("i=84", savedExpanded),
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


  //Expand 

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
            // loadExpandedChildren already uses executeWithLoading internally
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

  const onSelectTree = useCallback((selectedKeys: React.Key[]) => {
    setSelectedKeys(selectedKeys as string[]);
    if (root && selectedKeys.length > 0) {
      const node = findNodeById(root, selectedKeys[0] as string);
      if (node) onNodeSelect(node);
    }
  }, [root, onNodeSelect]);

  const treeData: TreeDataNode[] = [uaNodeToTreeData(root, onNodeSelect, setSelectedKeys, addSubscription, addEventSubscription, openMethodDialog)];

  return (
      <Tree
        className="address-space-tree"
        treeData={treeData}
        expandedKeys={expandedKeys}
        autoExpandParent={autoExpandParent}
        selectedKeys={selectedKeys}
        onExpand={onExpand}
        onSelect={onSelectTree}
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

export default ASpaceBody;
