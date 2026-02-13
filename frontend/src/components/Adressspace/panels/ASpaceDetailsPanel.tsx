import React, { useEffect, useState } from 'react';

import { useLoading } from '../../../contexts/LoadingContext';
import type { NodeDetails, NodeReference } from '../api';
import { fetchNodeDetails, fetchReferences } from '../api';
import type { UaNode } from '../types';

interface ASpaceDetailsPanelProps {
  node: UaNode | null;
  opcUaUrl: string | null;
}

export const ASpaceDetailsPanel: React.FC<ASpaceDetailsPanelProps> = ({ node, opcUaUrl }) => {
  const [details, setDetails] = useState<NodeDetails | null>(null);
  const [references, setReferences] = useState<NodeReference[]>([]);
  const { executeWithLoading } = useLoading();

  useEffect(() => {
    if (!node || !opcUaUrl) {
      setDetails(null);
      setReferences([]);
      return;
    }

    const load = async () => {
      const [d, r] = await executeWithLoading(
        `Loading details for node ${node.displayName} (${node.nodeId})`,
        () =>
          Promise.all([
            fetchNodeDetails(opcUaUrl, node.nodeId),
            fetchReferences(opcUaUrl, node.nodeId),
          ]),
        {
          errorMessage: `Failed to load node details for "${node.displayName}" (${node.nodeId}) from ${opcUaUrl}`,
        },
      );
      setDetails(d);
      setReferences(r);
    };
    load();
  }, [node?.nodeId, opcUaUrl, executeWithLoading]);

  return (
    <div className="flex gap-2 h-full overflow-y-hidden">
      <Properties details={details} />
      <References references={references} />
    </div>
  );
};

const Properties: React.FC<{ details: NodeDetails | null }> = ({ details }) => {
  const rows: [string, any][] = [
    ['Node ID', details?.nodeId],
    ['Browse Name', details?.browseName],
    ['Display Name', details?.displayName],
    ['Node Class', `${details?.nodeClass} (${details?.nodeClassValue})`],
    ['Description', details?.description],
  ];
  rows.push(['Value', JSON.stringify(details?.value)]);
  rows.push(['Data Type', details?.dataType]);
  rows.push(['Event Notifier', details?.eventNotifier]);

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
              <td className="cell-muted">{ref.ReferenceType.split(' ')[0]}</td>
              <td className="cell-mono">{ref.NodeId}</td>
              <td className="cell-muted">{ref.BrowseName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
