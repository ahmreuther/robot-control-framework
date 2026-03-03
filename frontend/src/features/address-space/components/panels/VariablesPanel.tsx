import type { Subscription } from '../../hooks/useSubscriptions';

interface VariablesPanelProps {
  subscriptions: Subscription[];
}

export const VariablesPanel = ({ subscriptions }: VariablesPanelProps) => {
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
          </tr>
        </thead>
        {subscriptions.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={4} className="text-center cell-muted">
                No active subscriptions
              </td>
            </tr>
          </tbody>
        )}
        <tbody>
          {subscriptions.map((s) => (
            <tr key={s.nodeId}>
              <td className="cell-muted">{s.displayName}</td>
              <td className="cell-mono" title={s.nodeId}>
                {s.nodeId}
              </td>
              <td className="cell-mono">{s.value ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
