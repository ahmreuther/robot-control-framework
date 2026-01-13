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
    const [messageLog, setMessageLog] = useState<string[]>([]); // Keep full history

    // Format axle values for display
    const jointsText =
        Object.keys(axleValues).length === 0
            ? '-'
            : Object.entries(axleValues)
                .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
                .join(', ');
                
    return (
        <div className="overflow-auto rounded p-4 space-y-3 text-white bg-black bg-opacity-70 border border-white/20">
            {/* Identifier Header */}
            <div className="text-sm font-bold uppercase tracking-wide border-b border-white/20 pb-2">
                Live Status
            </div>

            {/* Debug Info */}
            <div className="text-xs text-gray-400 p-2 bg-black/50 rounded">{debugInfo}</div>

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
                {robotInfo.manufacturer && <StatusItem label="Manufacturer" value={robotInfo.manufacturer} />}
                {robotInfo.serialNumber && <StatusItem label="Serial Number" value={robotInfo.serialNumber} />}
            </div>

            {/* Optional: live message log */}
            <div className="mt-4 text-xs text-gray-400 overflow-auto max-h-40 bg-black/30 p-2 rounded">
                <div className="font-bold mb-1">Message Log:</div>
                {messageLog.map((msg, idx) => (
                    <div key={idx} className="border-b border-white/10 py-0.5">
                        {msg}
                    </div>
                ))}
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

