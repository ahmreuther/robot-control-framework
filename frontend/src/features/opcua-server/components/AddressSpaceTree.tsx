import { Tree } from "antd";
import type { TreeDataNode, TreeProps } from "antd";
import { useEffect, useMemo } from "react";
import { useOpcuaServer } from "../context/OpcuaServerContext";

export default function AddressSpaceTree() {
  const {
    activeServerUrl,
    activeAddressSpaceState: treeState,
    browseAddressSpaceRoot,
    browseAddressSpaceChildren,
    selectAddressSpaceNode,
    setAddressSpaceExpandedNodeIds,
  } = useOpcuaServer();

  useEffect(() => {
    if (!activeServerUrl) return;
    if ((treeState?.rootRequestStatus ?? "idle") === "idle") {
      browseAddressSpaceRoot(activeServerUrl);
    }
  }, [activeServerUrl, browseAddressSpaceRoot, treeState?.rootRequestStatus]);

  const treeData = useMemo<TreeDataNode[]>(() => {
    if (!treeState) return [];

    const build = (nodeId: string): TreeDataNode => {
      const node = treeState.nodesById[nodeId];
      const childIds = treeState.childrenByNodeId[nodeId] ?? [];

      return {
        key: nodeId,
        title: node?.displayName ?? node?.browseName ?? nodeId,
        children: childIds.map(build),
        isLeaf: node ? !node.hasChildren : true,
      };
    };

    return treeState.rootNodeIds.map(build);
  }, [treeState]);

  const selectedKeys = treeState?.selectedNodeId
    ? [treeState.selectedNodeId]
    : [];
  const expandedKeys = treeState?.expandedNodeIds ?? [];
  const isRootLoading = treeState?.rootRequestStatus === "loading";

  const onSelect: TreeProps["onSelect"] = (keys) => {
    const selectedNodeId = (keys[0] as string | undefined) ?? null;
    selectAddressSpaceNode(activeServerUrl ?? "", selectedNodeId);
  };

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setAddressSpaceExpandedNodeIds(
      activeServerUrl ?? "",
      keys.map((key) => String(key)),
    );
  };

  const loadData: TreeProps["loadData"] = async (treeNode) => {
    const nodeId = String(treeNode.key);
    if (!treeState) return;
    const node = treeState.nodesById[nodeId];
    const requestStatus =
      treeState.childRequestStatusByNodeId[nodeId] ?? "idle";
    if (
      !node?.hasChildren ||
      requestStatus === "loading" ||
      requestStatus === "succeeded"
    ) {
      return;
    }

    browseAddressSpaceChildren(activeServerUrl ?? "", nodeId);
  };

  return (
    <div className="box-border h-full min-h-0 overflow-hidden px-0 py-2 pl-2">
      <div className="panel h-full w-full overflow-y-auto">
        {treeState?.error ? (
          <div className="text-xs text-rose-300">{treeState.error}</div>
        ) : treeData.length === 0 && !isRootLoading ? (
          <div className="text-xs text-[rgb(var(--fg-muted))]"></div>
        ) : (
          <Tree
            key={activeServerUrl ?? "no-server"}
            className="address-space-tree"
            treeData={treeData}
            selectedKeys={selectedKeys}
            expandedKeys={expandedKeys}
            onSelect={onSelect}
            onExpand={onExpand}
            loadData={loadData}
            showLine={{ showLeafIcon: false }}
            style={{
              background: "rgb(var(--panel))",
              color: "rgb(var(--fg))",
              padding: "0.5rem",
            }}
          />
        )}
      </div>
    </div>
  );
}
