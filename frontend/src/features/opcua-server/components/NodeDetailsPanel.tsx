import { useEffect, useState } from "react";

import {
  getNodeLiveValue,
  serverNodeKey,
} from "../../../entities/server/model/store";
import { formatUnknownPayload } from "../../../shared/api/formatUnknownPayload";
import { useOpcuaServer } from "../context/OpcuaServerContext";
import EventSubscriptionPanel from "./EventSubscriptionPanel";
import RawMethodCallModal from "./RawMethodCallModal";
import VariableSubscriptionPanel from "./VariableSubscriptionPanel";

export default function NodeDetailsPanel() {
  const {
    activeServerUrl,
    activeAddressSpaceState: treeState,
    selectedNodeId,
    selectedNode,
    selectedNodeDetails: nodeDetails,
    selectedNodeReferences: references,
    snapshot,
    browseAddressSpaceReferences,
    browseAddressSpaceNodeDetails,
    subscribeNode,
    unsubscribeNode,
    subscribeEvent,
    unsubscribeEvent,
  } = useOpcuaServer();
  const [rawMethodModalOpen, setRawMethodModalOpen] = useState(false);
  const detailRequestStatus =
    selectedNodeId === null
      ? "idle"
      : (treeState?.detailRequestStatusByNodeId[selectedNodeId] ?? "idle");
  const referenceRequestStatus =
    selectedNodeId === null
      ? "idle"
      : (treeState?.referenceRequestStatusByNodeId[selectedNodeId] ?? "idle");
  const isLoadingDetails =
    detailRequestStatus === "loading";
  const liveValue =
    activeServerUrl && selectedNodeId
      ? getNodeLiveValue(snapshot.server, activeServerUrl, selectedNodeId)?.value
      : undefined;
  const isLoadingReferences = referenceRequestStatus === "loading";
  const selectedNodeKey =
    activeServerUrl && selectedNodeId
      ? serverNodeKey(activeServerUrl, selectedNodeId)
      : null;
  const isVariableSubscribed =
    selectedNodeKey !== null &&
    snapshot.server.subscribedNodeKeys.includes(selectedNodeKey);
  const isEventSubscribed =
    selectedNodeKey !== null &&
    snapshot.server.subscribedEventNodeKeys.includes(selectedNodeKey);
  const selectedNodeClass =
    nodeDetails?.nodeClass ?? selectedNode?.nodeClass ?? null;

  useEffect(() => {
    if (!activeServerUrl || !selectedNodeId) return;
    if (referenceRequestStatus === "idle") {
      browseAddressSpaceReferences(activeServerUrl, selectedNodeId);
    }
  }, [
    activeServerUrl,
    browseAddressSpaceReferences,
    referenceRequestStatus,
    selectedNodeId,
  ]);

  useEffect(() => {
    if (!activeServerUrl || !selectedNodeId) return;
    if (detailRequestStatus === "idle") {
      browseAddressSpaceNodeDetails(activeServerUrl, selectedNodeId);
    }
  }, [
    activeServerUrl,
    browseAddressSpaceNodeDetails,
    detailRequestStatus,
    selectedNodeId,
  ]);

  const rows = buildNodeDetailRows({
    nodeId: nodeDetails?.nodeId ?? selectedNode?.nodeId ?? "",
    browseName: nodeDetails?.browseName ?? selectedNode?.browseName ?? "",
    displayName: nodeDetails?.displayName ?? selectedNode?.displayName ?? "",
    nodeClass: nodeDetails?.nodeClass ?? selectedNode?.nodeClass,
    nodeClassValue: nodeDetails?.nodeClassValue,
    description: nodeDetails?.description ?? "",
    value: nodeDetails?.value !== undefined ? nodeDetails.value : liveValue,
    dataType: nodeDetails?.dataType ?? "",
    eventNotifier: nodeDetails?.eventNotifier ?? "",
  });

  function handleSubscriptionToggle(kind: "variable" | "event") {
    if (!activeServerUrl || !selectedNodeId) return;
    if (kind === "variable") {
      if (isVariableSubscribed) {
        unsubscribeNode(activeServerUrl, selectedNodeId);
        return;
      }
      subscribeNode(activeServerUrl, selectedNodeId);
      return;
    }
    if (isEventSubscribed) {
      unsubscribeEvent(activeServerUrl, selectedNodeId);
      return;
    }
    subscribeEvent(activeServerUrl, selectedNodeId);
  }

  function handlePrimaryAction() {
    if (!activeServerUrl || !selectedNodeId) return;
    if (selectedNodeClass === "Variable") {
      handleSubscriptionToggle("variable");
      return;
    }
    if (selectedNodeClass === "Object") {
      handleSubscriptionToggle("event");
      return;
    }
    if (selectedNodeClass === "Method") {
      setRawMethodModalOpen(true);
    }
  }

  const primaryAction = getPrimaryAction(
    selectedNodeClass,
    isVariableSubscribed,
    isEventSubscribed,
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-auto pr-2 pt-2">
      <div className="panel shrink-0 gap-2">
        <header className="panel-header">
          <div className="flex min-w-0 items-center gap-3">
            <div className="panel-title">Node</div>
          </div>
        </header>
        <div className="panel-body flex w-full gap-2">
          <section className="panel min-h-0 w-1/2 overflow-auto">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>PropertyType</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <td className="cell-muted">{row.label}</td>
                    <td className="cell-mono">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="panel-body w-full">
              <button
                className={`button-ghost w-full ${primaryAction.active ? " active" : ""}`}
                disabled={!primaryAction.enabled}
                onClick={handlePrimaryAction}
              >
                {primaryAction.label}
              </button>
            </div>
          </section>

          <section className="panel min-h-0 w-1/2 overflow-auto">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>ReferenceType</th>
                  <th>NodeId</th>
                  <th>BrowseName</th>
                </tr>
              </thead>
              <tbody>
                {references.map((reference) => (
                  <tr key={`${reference.referenceType}-${reference.nodeId}`}>
                    <td className="cell-muted">
                      {reference.referenceType.split(" ")[0]}
                    </td>
                    <td className="cell-mono">{reference.nodeId}</td>
                    <td className="cell-muted">
                      {reference.browseName ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 pb-2">
        <VariableSubscriptionPanel
          serverUrl={activeServerUrl}
        />
        <EventSubscriptionPanel
          serverUrl={activeServerUrl}
        />
      </div>

      <RawMethodCallModal
        open={rawMethodModalOpen}
        serverUrl={activeServerUrl}
        nodeId={selectedNodeId}
        displayName={nodeDetails?.displayName ?? selectedNode?.displayName}
        inputArguments={nodeDetails?.inputArguments ?? []}
        onClose={() => setRawMethodModalOpen(false)}
      />
    </div>
  );
}

function buildNodeDetailRows(input: {
  nodeId: string;
  browseName: string;
  displayName: string;
  nodeClass: string | null | undefined;
  nodeClassValue: number | null | undefined;
  description: string;
  value: unknown;
  dataType: string;
  eventNotifier: string;
}): Array<{ label: string; value: string }> {
  return [
    { label: "Node ID", value: input.nodeId },
    { label: "Browse Name", value: input.browseName },
    { label: "Display Name", value: input.displayName },
    {
      label: "Node Class",
      value: formatNodeClass(input.nodeClass, input.nodeClassValue),
    },
    { label: "Description", value: input.description },
    { label: "Value", value: formatUnknownPayload(input.value) },
    { label: "Data Type", value: input.dataType },
    { label: "Event Notifier", value: input.eventNotifier },
  ];
}

function formatNodeClass(
  nodeClass: string | null | undefined,
  nodeClassValue: number | null | undefined,
): string {
  if (!nodeClass && nodeClassValue === undefined) return "";
  if (nodeClass && nodeClassValue !== null && nodeClassValue !== undefined) {
    return `${nodeClass} (${nodeClassValue})`;
  }
  return nodeClass ?? "";
}

function getPrimaryAction(
  nodeClass: string | null,
  isVariableSubscribed: boolean,
  isEventSubscribed: boolean,
): { label: string; enabled: boolean; active: boolean } {
  if (nodeClass === "Variable") {
    return {
      label: isVariableSubscribed
        ? "Unsubscribe Variable"
        : "Subscribe Variable",
      enabled: true,
      active: isVariableSubscribed,
    };
  }
  if (nodeClass === "Object") {
    return {
      label: isEventSubscribed ? "Unsubscribe Event" : "Subscribe Event",
      enabled: true,
      active: isEventSubscribed,
    };
  }
  if (nodeClass === "Method") {
    return {
      label: "Call Method",
      enabled: true,
      active: false,
    };
  }
  return {
    label: "No Action",
    enabled: false,
    active: false,
  };
}
