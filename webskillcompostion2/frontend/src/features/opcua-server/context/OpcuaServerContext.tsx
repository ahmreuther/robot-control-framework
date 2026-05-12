import { createContext, useContext, useMemo, type ReactNode } from "react";

import type {
  ApplicationController,
  ApplicationSnapshot,
  RawMethodCommand,
} from "../../../app/model/applicationController";
import type { AddressSpaceNode, AddressSpaceNodeDetails, AddressSpaceReference } from "../../../entities/opcua/model/types";
import type {
  AddressSpaceServerState,
} from "../../../entities/server/model/store";
import type { ServerSessionInfo } from "../../../entities/server/model/types";

export interface OpcuaServerContextValue {
  controller: ApplicationController;
  snapshot: ApplicationSnapshot;
  servers: ServerSessionInfo[];
  activeServerUrl: string | null;
  activeServer: ServerSessionInfo | null;
  activeAddressSpaceState: AddressSpaceServerState | null;
  selectedNodeId: string | null;
  selectedNode: AddressSpaceNode | null;
  selectedNodeDetails: AddressSpaceNodeDetails | null;
  selectedNodeReferences: AddressSpaceReference[];
  connectServer(serverUrl: string): string;
  discoverRobots(serverUrl: string): string;
  disconnectServer(serverUrl: string): string;
  selectServer(serverUrl: string | null): void;
  browseAddressSpaceRoot(serverUrl: string): string;
  browseAddressSpaceChildren(serverUrl: string, nodeId: string): string;
  browseAddressSpaceReferences(serverUrl: string, nodeId: string): string;
  browseAddressSpaceNodeDetails(serverUrl: string, nodeId: string): string;
  selectAddressSpaceNode(serverUrl: string, nodeId: string | null): void;
  setAddressSpaceExpandedNodeIds(serverUrl: string, nodeIds: string[]): void;
  subscribeNode(serverUrl: string, nodeId: string): string;
  unsubscribeNode(serverUrl: string, nodeId: string): string;
  subscribeEvent(serverUrl: string, nodeId: string): string;
  unsubscribeEvent(serverUrl: string, nodeId: string): string;
  callRawMethod(command: RawMethodCommand): string;
}

const OpcuaServerContext = createContext<OpcuaServerContextValue | null>(null);

export interface OpcuaServerProviderProps {
  controller: ApplicationController;
  snapshot: ApplicationSnapshot;
  children: ReactNode;
}

export function OpcuaServerProvider({
  controller,
  snapshot,
  children,
}: OpcuaServerProviderProps) {
  const value = useMemo<OpcuaServerContextValue>(() => {
    const servers = Object.values(snapshot.server.byUrl);
    const activeServerUrl = snapshot.server.activeServerUrl;
    const activeServer =
      activeServerUrl !== null ? snapshot.server.byUrl[activeServerUrl] ?? null : null;
    const activeAddressSpaceState =
      activeServerUrl !== null
        ? snapshot.server.addressSpace.byServerUrl[activeServerUrl] ?? null
        : null;
    const selectedNodeId = activeAddressSpaceState?.selectedNodeId ?? null;
    const selectedNode =
      selectedNodeId !== null
        ? activeAddressSpaceState?.nodesById[selectedNodeId] ?? null
        : null;
    const selectedNodeDetails =
      selectedNodeId !== null
        ? activeAddressSpaceState?.detailsByNodeId[selectedNodeId] ?? null
        : null;
    const selectedNodeReferences =
      selectedNodeId !== null
        ? activeAddressSpaceState?.referencesByNodeId[selectedNodeId] ?? []
        : [];

    return {
      controller,
      snapshot,
      servers,
      activeServerUrl,
      activeServer,
      activeAddressSpaceState,
      selectedNodeId,
      selectedNode,
      selectedNodeDetails,
      selectedNodeReferences,
      connectServer: (serverUrl: string) => controller.connectServer(serverUrl),
      discoverRobots: (serverUrl: string) => controller.discoverRobots(serverUrl),
      disconnectServer: (serverUrl: string) => controller.disconnectServer(serverUrl),
      selectServer: (serverUrl: string | null) => controller.selectServer(serverUrl),
      browseAddressSpaceRoot: (serverUrl: string) =>
        controller.browseAddressSpaceRoot(serverUrl),
      browseAddressSpaceChildren: (serverUrl: string, nodeId: string) =>
        controller.browseAddressSpaceChildren(serverUrl, nodeId),
      browseAddressSpaceReferences: (serverUrl: string, nodeId: string) =>
        controller.browseAddressSpaceReferences(serverUrl, nodeId),
      browseAddressSpaceNodeDetails: (serverUrl: string, nodeId: string) =>
        controller.browseAddressSpaceNodeDetails(serverUrl, nodeId),
      selectAddressSpaceNode: (serverUrl: string, nodeId: string | null) =>
        controller.selectAddressSpaceNode(serverUrl, nodeId),
      setAddressSpaceExpandedNodeIds: (serverUrl: string, nodeIds: string[]) =>
        controller.setAddressSpaceExpandedNodeIds(serverUrl, nodeIds),
      subscribeNode: (serverUrl: string, nodeId: string) =>
        controller.subscribeNode(serverUrl, nodeId),
      unsubscribeNode: (serverUrl: string, nodeId: string) =>
        controller.unsubscribeNode(serverUrl, nodeId),
      subscribeEvent: (serverUrl: string, nodeId: string) =>
        controller.subscribeEvent(serverUrl, nodeId),
      unsubscribeEvent: (serverUrl: string, nodeId: string) =>
        controller.unsubscribeEvent(serverUrl, nodeId),
      callRawMethod: (command: RawMethodCommand) => controller.callRawMethod(command),
    };
  }, [controller, snapshot]);

  return (
    <OpcuaServerContext.Provider value={value}>
      {children}
    </OpcuaServerContext.Provider>
  );
}

export function useOpcuaServer(): OpcuaServerContextValue {
  const context = useContext(OpcuaServerContext);
  if (!context) {
    throw new Error("useOpcuaServer must be used within an OpcuaServerProvider.");
  }
  return context;
}
