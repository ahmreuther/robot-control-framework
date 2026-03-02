import { useDirectMethodCallStatus } from '../Adressspace/hooks/useMethodCall';

function formatTime(timestamp: number | null) {
  if (!timestamp) {
    return '-';
  }
  return new Date(timestamp).toLocaleTimeString();
}

export function MethodCallStatusPanel() {
  const status = useDirectMethodCallStatus();

  return (
    <div className="bg-black/80 text-white p-3 rounded border border-white/20 text-xs max-w-xs">
      <div className="font-bold mb-2">Method Call State</div>
      <div className="mb-1">Status: {status.status}</div>
      <div className="mb-1">Last Node: {status.lastNodeId ?? '-'}</div>
      <div className="mb-1">Sent At: {formatTime(status.lastSentAt)}</div>
      <div className="mb-1">Result At: {formatTime(status.lastResultAt)}</div>
      <div className="mb-1">Result: {status.lastResult ?? '-'}</div>
    </div>
  );
}
