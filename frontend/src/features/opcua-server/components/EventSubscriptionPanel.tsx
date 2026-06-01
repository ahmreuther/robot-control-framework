import { serverNodeIdFromKey } from "../../../entities/server/model/store";
import { useOpcuaServer } from "../context/OpcuaServerContext";

export interface EventSubscriptionPanelProps {
  serverUrl: string | null;
}

export default function EventSubscriptionPanel({
  serverUrl,
}: EventSubscriptionPanelProps) {
  const { snapshot, selectAddressSpaceNode } = useOpcuaServer();
  const addressSpaceState = serverUrl
    ? snapshot.server.addressSpace.byServerUrl[serverUrl]
    : undefined;
  const rows = (
    serverUrl
      ? snapshot.server.subscribedEventNodeKeys
          .map((key) => {
            const nodeId = serverNodeIdFromKey(serverUrl, key);
            if (nodeId === null) return null;
            const node =
              addressSpaceState?.detailsByNodeId[nodeId] ??
              addressSpaceState?.nodesById[nodeId];
            return {
              variable: node?.displayName ?? node?.browseName ?? nodeId,
              nodeId,
            };
          })
          .filter((row) => row !== null)
      : []
  ).sort((a, b) => a.variable.localeCompare(b.variable));

  return (
    <section className="panel min-h-0 w-1/2 overflow-auto">
      <header className="panel-header">
        <div className="panel-title">Event Subscription</div>
      </header>
      <div className="panel-body">
        <table
          className="panel-table border-x border-t"
          style={{ borderColor: "rgb(var(--panel-border) / 0.1)" }}
        >
          <thead>
            <tr>
              <th>Variable</th>
              <th>NodeId</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.nodeId}
                className="cursor-pointer"
                onClick={() => {
                  if (!serverUrl) return;
                  selectAddressSpaceNode(serverUrl, row.nodeId);
                }}
              >
                <td className="cell-muted">{row.variable}</td>
                <td className="cell-mono">{row.nodeId}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="cell-muted" colSpan={2}>
                  No subscribed events.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
