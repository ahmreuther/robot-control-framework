
// Datei: `frontend/src/components/Live_Status.tsx`
import { useEffect, useRef, useState } from 'react';
import '../App.css'; // korrigierter Pfad

type Subscriptions = Record<string, string>;
const WS_URL = 'ws://127.0.0.1:8000/ws';

export default function Live_Status() {
    const socketRef = useRef<WebSocket | null>(null);

    const [robotName, setRobotName] = useState<string>('-');
    const [robotStatus, setRobotStatus] = useState<string>('Not Connected');
    const [robotMode, setRobotMode] = useState<string>('-');
    const [jointsText, setJointsText] = useState<string>('-');
    const [tcpText, setTcpText] = useState<string>('-');
    const [messageLog, setMessageLog] = useState<string[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscriptions>({});

    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        socketRef.current = ws;

        const appendLog = (m: string) =>
            setMessageLog((prev) => [...prev.slice(-199), `${new Date().toLocaleTimeString()} · ${m}`]);

        ws.addEventListener('open', () => {
            appendLog(`WebSocket opened to ${WS_URL}`);
            try { ws.send('status'); } catch {}
        });

        ws.addEventListener('message', (ev) => {
            const msg = typeof ev.data === 'string' ? ev.data : '';
            appendLog(msg);
            handleMessage(msg);
        });

        ws.addEventListener('close', () => {
            appendLog('WebSocket closed');
            setRobotStatus('Not Connected');
            setRobotMode('-');
            setSubscriptions({});
            socketRef.current = null;
        });

        ws.addEventListener('error', () => appendLog('WebSocket error'));

        function handleMessage(msg: string) {
            if (!msg) return;

            if (msg.startsWith('✅ Connected to ')) {
                setRobotStatus('Connected');
                return;
            }
            if (msg.startsWith('Model:')) {
                setRobotName(msg.replace('Model:', '').trim() || '-');
                setRobotStatus('Connected');
                return;
            }
            if (msg.startsWith('🔌 Disconnected from ')) {
                setRobotStatus('Not Connected');
                setRobotMode('-');
                setSubscriptions({});
                return;
            }
            if (msg.startsWith('x|Mode:')) {
                setRobotMode(msg.replace('x|Mode:', '').trim() || '-');
                return;
            }
            if (msg.startsWith('x|robotinfo:')) {
                const payload = msg.replace('x|robotinfo:', '').trim();
                try {
                    const parsed = JSON.parse(payload);
                    const manufacturer = parsed.manufacturer ?? '';
                    const model = parsed.model ?? '';
                    setRobotName((manufacturer ? manufacturer + ' ' : '') + (model || '-'));
                } catch {
                    if (payload) setRobotName(payload);
                }
                return;
            }
            if (msg.startsWith('x|angles:') || msg.startsWith('JOINTS|') || msg.startsWith('ANGLES|')) {
                const payload = msg.replace(/^x\|angles:|^JOINTS\||^ANGLES\|/, '').trim();
                try {
                    const parsed = JSON.parse(payload);
                    if (Array.isArray(parsed)) {
                        const formatted = parsed.map((v, i) => `j${i + 1}:${Number(v).toFixed(1)}°`).join(', ');
                        setJointsText(formatted);
                    } else if (typeof parsed === 'object') {
                        setJointsText(JSON.stringify(parsed));
                    } else {
                        setJointsText(String(parsed));
                    }
                } catch {
                    setJointsText(payload || '-');
                }
                return;
            }
            if (msg.startsWith('TCP_POS|')) {
                const payload = msg.replace('TCP_POS|', '').trim();
                setTcpText(payload || '-');
                return;
            }
            if (msg.startsWith('x|custom:')) {
                const payload = msg.replace('x|custom:', '').trim();
                const parts = payload.split('|');
                if (parts.length >= 2) {
                    const nodeId = parts[0];
                    const value = parts.slice(1).join('|');
                    setSubscriptions((s) => ({ ...s, [nodeId]: value }));
                    return;
                }
                try {
                    const parsed = JSON.parse(payload);
                    if (typeof parsed === 'object' && parsed !== null) {
                        setSubscriptions((s) => ({ ...s, ...(parsed as Subscriptions) }));
                        return;
                    }
                } catch {}
            }
        }

        return () => {
            try { ws.close(); } catch {}
            socketRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const subRows = Object.entries(subscriptions);

    return (
        <div style={{ padding: 12, borderRadius: 6, maxWidth: 920 }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Live Status</h4>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
                <div>
                    <div style={{ fontSize: 12, color: '#666' }}>Connected Robot Name:</div>
                    <div id="robot-name-value" style={{ fontWeight: 600 }}>{robotName}</div>
                </div>

                <div>
                    <div style={{ fontSize: 12, color: '#666' }}>Status:</div>
                    <div id="robot-status-value" style={{ color: robotStatus === 'Connected' ? '#2a9d8f' : '#f39c12' }}>{robotStatus}</div>
                </div>

                <div>
                    <div style={{ fontSize: 12, color: '#666' }}>Mode:</div>
                    <div id="robot-mode-value">{robotMode}</div>
                </div>

                <div>
                    <div style={{ fontSize: 12, color: '#666' }}>TCP:</div>
                    <div id="robot-tcp-value" title={tcpText} style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tcpText}</div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ minWidth: 320, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Joints</div>
                    <div id="robot-position-value" style={{ color: '#2ecc71' }}>{jointsText}</div>

                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>Subscriptions</div>
                    <div style={{ maxHeight: 160, overflow: 'auto', border: '1px solid #eee', padding: 8, borderRadius: 4 }}>
                        {subRows.length === 0 ? <div style={{ color: '#666' }}>Keine Subscriptions</div> :
                            subRows.map(([k, v]) => <div key={k} style={{ fontSize: 13 }}><strong>{k}</strong>: {v}</div>)}
                    </div>
                </div>

                <div style={{ minWidth: 360, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Message Log</div>
                    <div id="message-log" style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #eee', padding: 8, borderRadius: 4, fontSize: 12 }}>
                        {messageLog.length === 0 ? <div style={{ color: '#666' }}>Keine Nachrichten</div> :
                            messageLog.map((m, i) => <div key={i} style={{ padding: '2px 0' }}>{m}</div>)}
                    </div>
                </div>
            </div>
        </div>
    );
}
