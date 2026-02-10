import React, { useState, useEffect } from "react";
import { UaNode } from "../types";
import { fetchNodeDetails, fetchReferences, NodeDetails, NodeReference } from "../api";
import { EventsPanel} from "./EventsPanel";
import { VariablesPanel } from "./VariablesPanel";
import { Panel, Group } from 'react-resizable-panels'
import { Subscription } from "../hooks/useSubscriptions";
import { EventSubscription } from "../hooks/useEventSubscriptions";

type ASpaceDetailsPanelProps = {
  node: UaNode | null;
  opcUaUrl: string;
  eventSubscriptions: EventSubscription[];
  onRemoveEventSubscription: (nodeId: string) => void;
  variableSubscriptions: Subscription[];
  onRemoveVariableSubscription: (nodeId: string) => void;
};

export const ASpaceDetailsPanel: React.FC<ASpaceDetailsPanelProps> = ({ node, opcUaUrl, eventSubscriptions, onRemoveEventSubscription, variableSubscriptions, onRemoveVariableSubscription }) => {
  const [details, setDetails] = useState<NodeDetails | null>(null);
  const [references, setReferences] = useState<NodeReference[]>([]);

  //TODO LOADING INFRA!!!
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!node || !opcUaUrl) {
      setDetails(null);
      setReferences([]);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [d, r] = await Promise.all([
          fetchNodeDetails(opcUaUrl, node.nodeId),
          fetchReferences(opcUaUrl, node.nodeId),
        ]);
        setDetails(d);
        setReferences(r);
      } catch (e: any) {
        setError(e?.message ?? "Error loading details");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [node?.nodeId, opcUaUrl]);

  return (
      <Group orientation="vertical">
        <Panel>
          <div className="flex gap-2 h-full overflow-y-hidden">
            <Properties details={details} />
            <References references={references} />
          </div>
        </Panel>
        <Panel>
          <div className="flex-col h-full overflow-y-auto mt-2">
          <VariablesPanel
            subscriptions={variableSubscriptions}
            onRemove={onRemoveVariableSubscription}
          />
          <EventsPanel
            subscriptions={eventSubscriptions}
            onRemove={onRemoveEventSubscription}
          />
          </div>
        </Panel>
      </Group>
  );
};

const Properties: React.FC<{ details: NodeDetails }> = ({ details }) => {
  const rows: [string, any][] = [
    ["Node ID", details?.nodeId],
    ["Browse Name", details?.browseName],
    ["Display Name", details?.displayName],
    ["Node Class", `${details?.nodeClass} (${details?.nodeClassValue})`],
    ["Description", details?.description],
  ];
    rows.push(["Value", JSON.stringify(details?.value)]);
    rows.push(["Data Type", details?.dataType]);
    rows.push(["Event Notifier", details?.eventNotifier]);

  return (
    <div className="panel overflow-y-auto w-1/2">
      <table className="panel-table">
        <thead>
        <tr>
          <th>PropertyType</th>
          <th>Value</th>
        </tr>
      </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="cell-muted">{label}</td>
              <td className="cell-mono">{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const References: React.FC<{ references: NodeReference[] }> = ({ references }) => {
  return (
    <div className="panel overflow-auto w-1/2">
      <table className="panel-table">
        <thead>
          <tr>
            <th>ReferenceType</th>
            <th>NodeId</th>
            <th>BrowseName</th>
          </tr>
        </thead>
        <tbody>
          {references.map((ref, i) => (
            <tr key={i}>
              <td className="cell-muted">{ref.ReferenceType.split(" ")[0]}</td>
              <td className="cell-mono">{ref.NodeId}</td>
              <td className="cell-muted">{ref.BrowseName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
