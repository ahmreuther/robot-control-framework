import { Subscription } from "../hooks/useSubscriptions";

type VariablesPanelProps = {
  subscriptions: Subscription[];
  onRemove: (nodeId: string) => void;
};

export const VariablesPanel = ({subscriptions, onRemove}:VariablesPanelProps) => {
  return (
    <div className="panel mb-2">
      <header className="panel-header">
        <div className="panel-title flex">Variable Subscriptions</div>
      </header>
      <table className="panel-table">
      <thead>
        <tr>
          <th>Variable</th>
          <th>NodeId</th>
          <th>Value</th>
          <th></th>
        </tr>
      </thead>
      {subscriptions.length === 0 && (
        <tbody>
          <tr>
            <td colSpan={4} className="text-center cell-muted">No active subscriptions</td>
          </tr>
        </tbody>
      )}
      <tbody>
        {subscriptions.map((s) => (
          <tr key={s.nodeId}>
            <td className="cell-muted">{s.displayName}</td>
            <td className="cell-mono" title={s.nodeId}>{s.nodeId}</td>
            <td className="cell-mono">{s.value ?? ""}</td>
            <td className="text-right"><button onClick={() => onRemove(s.nodeId)} className="button-ghost">Unsubscribe</button></td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
};
