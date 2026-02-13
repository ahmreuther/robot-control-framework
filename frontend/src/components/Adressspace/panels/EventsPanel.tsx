import type { EventSubscription } from '../hooks/useEventSubscriptions';

interface EventsPanelProps {
  subscriptions: EventSubscription[];
  onRemove: (nodeId: string) => void;
}

export const EventsPanel = ({ subscriptions, onRemove }: EventsPanelProps) => {
  return (
    <div className="panel mb-2">
      <header className="panel-header">
        <div className="panel-title flex">Event Subscriptions</div>
      </header>
      <table className="panel-table">
        <thead>
          <tr>
            <th>Object</th>
            <th>NodeId</th>
            <th></th>
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
              <td className="text-right">
                <button onClick={() => onRemove(s.nodeId)} className="button-ghost">
                  Unsubscribe
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
