import { useEffect, useState, useCallback, useContext } from 'react';
import { SocketContext } from '../../../hooks/use-socket';

type AxleValues = Record<string, number>;

type RobotInfo = {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    gotoMethodNodeId?: string;
    toggleEndEffMethodNodeId?: string | null;
};

export default function Live_Status() {
    const wsHook = useContext(SocketContext);

    const [robotName, setRobotName] = useState('-');
    const [robotStatus, setRobotStatus] = useState('Not Connected');
    const [robotMode, setRobotMode] = useState('-');
    const [axleValues, setAxleValues] = useState<AxleValues>({});
    const [robotInfo, setRobotInfo] = useState<RobotInfo>({});
    const [debugInfo, setDebugInfo] = useState('Initializing...');

    // Format axle values for display
    const jointsText =
        Object.keys(axleValues).length === 0
            ? '-'
            : Object.entries(axleValues)
                .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
                .join(', ');

    const handleMessage = useCallback((msg: string) => {
        if (!msg) return;

        // ---- Handle prefixed messages first ----
        if (msg.startsWith("x|")) {
            if (msg.startsWith("x|robotinfo:")) {
                try {
                    const payload = JSON.parse(msg.slice("x|robotinfo:".length));
                    setRobotInfo(payload);
                    if (payload.model) setRobotName(payload.model);
                    setRobotStatus('Connected');
                    setDebugInfo('✅ Robot info received');
                } catch (e) {
                    setDebugInfo('❌ Failed to parse robotinfo: ' + String(e));
                }
            } else if (msg.startsWith("x|Mode:")) {
                const modeValue = msg.replace("x|Mode:", "").trim();
                setRobotMode(modeValue);
                setRobotStatus('Connected');
                setDebugInfo('✅ Mode: ' + modeValue);
            } else if (msg.startsWith("x|angles:")) {
                try {
                    const dictStr = msg.replace("x|angles:", "").replace(/'/g, '"');
                    const anglesMsg = JSON.parse(dictStr);
                    if (anglesMsg.angles) setAxleValues(anglesMsg.angles);
                    setDebugInfo('✅ Axle values updated');
                } catch (e) {
                    setDebugInfo('❌ Failed to parse axle values: ' + String(e));
                }
            }
            return;
        }

        // ---- Handle unprefixed live status messages ----
        if (msg.startsWith("Robot info sent:")) {
            try {
                const payload = JSON.parse(msg.replace("Robot info sent:", "").trim());
                setRobotInfo(payload);
                if (payload.model) setRobotName(payload.model);
                setRobotStatus('Connected');
                setDebugInfo('✅ Robot info received');
            } catch (e) {
                setDebugInfo('❌ Failed to parse robot info: ' + String(e));
            }
            return;
        }

        if (msg.startsWith("Axle values collected:")) {
            try {
                const dictStr = msg.replace("Axle values collected:", "").replace(/'/g, '"');
                const anglesMsg = JSON.parse(dictStr);
                if (anglesMsg) setAxleValues(anglesMsg);
                setDebugInfo('✅ Axle values updated');
            } catch (e) {
                setDebugInfo('❌ Failed to parse axle values: ' + String(e));
            }
            return;
        }

        if (msg.startsWith("stream mode|")) {
            // Optional: parse stream mode updates if sent differently
            const modeValue = msg.split("|")[0].replace("stream mode", "").trim();
            if (modeValue) setRobotMode(modeValue);
            setRobotStatus('Connected');
            return;
        }

        // ---- Connection / Disconnection ----
        if (msg.startsWith("✅ Connected to ")) setRobotStatus('Connected');
        if (msg.startsWith("🔌 Disconnected from ")) {
            setRobotStatus('Not Connected');
            setRobotName('-');
            setRobotMode('-');
            setAxleValues({});
            setRobotInfo({});
            setDebugInfo('🔌 Disconnected');
        }
    }, []);

    // Listen to WebSocket lastMessage
    useEffect(() => {
        if (!wsHook?.lastMessage) return;
        const msg = wsHook.lastMessage.data;
        if (typeof msg === 'string') handleMessage(msg);
    }, [wsHook?.lastMessage, handleMessage]);

    return (
        <div className="overflow-auto rounded p-4 space-y-3 text-white bg-black bg-opacity-70 border border-white/20">

            {/* Identifier Header */}
            <div className="text-sm font-bold uppercase tracking-wide text-white/90 border-b border-white/20 pb-2">
                Live Status
            </div>

            {/* Debug Info */}
            <div className="text-xs text-gray-400 p-2 bg-black/50 rounded">
                {debugInfo}
            </div>

            {/* Status items */}
            <div className="flex flex-col space-y-2">
                <StatusItem label="Connected Robot" value={robotName} />
                <StatusItem
                    label="Status"
                    value={robotStatus}
                    valueClass={robotStatus === 'Connected' ? 'text-green-400' : 'text-yellow-400'}
                />
                <StatusItem label="Mode" value={robotMode} />
                <StatusItem label="Joints (Axles)" value={jointsText} />
                {robotInfo.manufacturer && (
                    <StatusItem label="Manufacturer" value={robotInfo.manufacturer} />
                )}
                {robotInfo.serialNumber && (
                    <StatusItem label="Serial Number" value={robotInfo.serialNumber} />
                )}
            </div>
        </div>
    );
}

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
