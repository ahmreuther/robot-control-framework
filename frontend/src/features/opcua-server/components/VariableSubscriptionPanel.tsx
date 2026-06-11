import { getSubscribedNodeValueRows } from "../../../entities/server/model/store";
import { formatUnknownPayload } from "../../../shared/api/formatUnknownPayload";
import { useOpcuaServer } from "../context/OpcuaServerContext";

export interface VariableSubscriptionPanelProps {
  serverUrl: string | null;
}

export default function VariableSubscriptionPanel({
  serverUrl,
}: VariableSubscriptionPanelProps) {
  const { snapshot, selectAddressSpaceNode } = useOpcuaServer();
  const rows = serverUrl
    ? getSubscribedNodeValueRows(snapshot.server, serverUrl)
    : [];

  return (
    <section className="panel min-h-0 w-1/2 overflow-auto">
      <header className="panel-header">
        <div className="panel-title">Variable Subscription</div>
      </header>
      <div className="panel-body">
        <table
          className="panel-table border"
          style={{ borderColor: "rgb(var(--panel-border) / 0.1)" }}
        >
          <thead>
            <tr>
              <th>Variable</th>
              <th>NodeId</th>
              <th>Value</th>
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
                <td className="cell-muted">{row.label}</td>
                <td className="cell-mono">{row.nodeId}</td>
                <td className="cell-mono">{formatUnknownPayload(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
