import { useEffect, useRef, useState } from 'react';

type Subscriptions = Record<string, string>;
const WS_URL = 'ws://127.0.0.1:8000/ws';

export default function Live_Status() {
    const socketRef = useRef<WebSocket | null>(null);

    const [robotName, setRobotName] = useState('-');
    const [robotStatus, setRobotStatus] = useState('Not Connected');
    const [robotMode, setRobotMode] = useState('-');
    const [jointsText, setJointsText] = useState('-');
    const [tcpText, setTcpText] = useState('-');
    const [subscriptions, setSubscriptions] = useState<Subscriptions>({});

    // Combine all subscriptions into a single string for display
    const subscriptionsText =
        Object.keys(subscriptions).length === 0
            ? 'Keine Subscriptions'
            : Object.entries(subscriptions)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');

    /*
    useEffect(() => {
      const ws = new WebSocket(WS_URL);
      socketRef.current = ws;

      const appendLog = (m: string) =>
        setMessageLog((prev) => [...prev.slice(-199), `${new Date().toLocaleTimeString()} · ${m}`]);

      ws.onopen = () => {
        appendLog(`WebSocket opened to ${WS_URL}`);
        ws.send('status');
      };

      ws.onmessage = (ev) => {
        const msg = typeof ev.data === 'string' ? ev.data : '';
        appendLog(msg);
        handleMessage(msg);
      };

      ws.onclose = () => {
        appendLog('WebSocket closed');
        setRobotStatus('Not Connected');
        setRobotMode('-');
        setSubscriptions({});
      };

      ws.onerror = () => appendLog('WebSocket error');

      function handleMessage(msg: string) {
        if (!msg) return;
        if (msg.startsWith('✅ Connected')) setRobotStatus('Connected');
        else if (msg.startsWith('Model:')) setRobotName(msg.replace('Model:', '').trim() || '-');
        else if (msg.startsWith('x|Mode:')) setRobotMode(msg.replace('x|Mode:', '').trim() || '-');
        else if (msg.startsWith('x|angles:')) setJointsText(msg.replace('x|angles:', '').trim());
        else if (msg.startsWith('TCP_POS|')) setTcpText(msg.replace('TCP_POS|', '').trim());
      }

      return () => ws.close();
    }, []);
    */

    return (
        <div className="overflow-auto rounded-lg p-3 space-y-2 text-white border border-white/30">

            {/* Identifier Header */}
            <div className="text-sm font-bold uppercase tracking-wider text-white/80 border-b border-white/20 pb-1 mb-2">
                Live Status
            </div>

            {/* Column layout */}
            <div className="flex flex-col space-y-1">
                <StatusItem label="Connected Robot" value={robotName} />
                <StatusItem
                    label="Status"
                    value={robotStatus}
                    valueClass={robotStatus === 'Connected' ? 'text-green-400' : 'text-yellow-400'}
                />
                <StatusItem label="Mode" value={robotMode} />
                <StatusItem label="TCP" value={tcpText} />
                <StatusItem label="Joints" value={jointsText} />
                <StatusItem label="Subscriptions" value={subscriptionsText} />
            </div>
        </div>
    );
}

/* Helper for single-line status items */
function StatusItem({
                        label,
                        value,
                        valueClass = '',
                    }: {
    label: string;
    value: string;
    valueClass?: string;
}) {
    return (
        <div className="flex justify-between">
            <span className="text-gray-300">{label}:</span>
            <span className={`font-medium ${valueClass}`}>{value}</span>
        </div>
    );
}
