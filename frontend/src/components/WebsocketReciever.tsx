import { useEffect, useState, useCallback, useContext } from 'react';
import { SocketContext } from '../hooks/use-socket';
import { LogContext } from '../contexts/LogContext';

type AxleValues = Record<string, number>;

type RobotInfo = {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    gotoMethodNodeId?: string;
    toggleEndEffMethodNodeId?: string | null;
};

export default function WebSocketReciever() {
    
    const socket = useContext(SocketContext);

    const [robotName, setRobotName] = useState('-');
    const [robotStatus, setRobotStatus] = useState('Not Connected');
    const [robotMode, setRobotMode] = useState('-');
    const [axleValues, setAxleValues] = useState<AxleValues>({});
    const [robotInfo, setRobotInfo] = useState<RobotInfo>({});
    const [debugInfo, setDebugInfo] = useState('Initializing...');

    const { logs, setLogs } = useContext(LogContext);

    // Handle every incoming WebSocket message
    const handleMessage = useCallback((msg: string) => {
        if (!msg) return;
        setLogs(prev => prev + `Received: ${msg}\n`); // always log

        try {
            if (msg.startsWith('x|robotinfo:')) {
                const payload = JSON.parse(msg.slice('x|robotinfo:'.length));
                setRobotInfo(payload);
                if (payload.model) setRobotName(payload.model);
                setRobotStatus('Connected');
                setDebugInfo('✅ Robot info received');
            } else if (msg.startsWith('x|Mode:')) {
                const mode = msg.replace('x|Mode:', '').trim();
                setRobotMode(mode);
                setRobotStatus('Connected');
                setDebugInfo('✅ Mode: ' + mode);
            } else if (msg.startsWith('x|angles:')) {
                const parsed = JSON.parse(msg.replace('x|angles:', '').replace(/'/g, '"'));
                if (parsed?.angles) setAxleValues(prev => ({ ...prev, ...parsed.angles }));
                setDebugInfo('✅ Axle values updated');
            } else if (msg.startsWith('Robot info sent:')) {
                const payload = JSON.parse(msg.replace('Robot info sent:', '').trim());
                setRobotInfo(payload);
                if (payload.model) setRobotName(payload.model);
                setRobotStatus('Connected');
                setDebugInfo('✅ Robot info received');
            } else if (msg.startsWith('Axle values collected:')) {
                const parsed = JSON.parse(msg.replace('Axle values collected:', '').replace(/'/g, '"'));
                setAxleValues(prev => ({ ...prev, ...parsed }));
                setDebugInfo('✅ Axle values updated');
            } else if (msg.startsWith('stream mode|')) {
                const modeValue = msg.split('|')[0].replace('stream mode', '').trim();
                if (modeValue) setRobotMode(modeValue);
                setRobotStatus('Connected');
            } else if (msg.startsWith('✅ Connected to ')) {
                setRobotStatus('Connected');
            } else if (msg.startsWith('🔌 Disconnected from ')) {
                setRobotStatus('Not Connected');
                setRobotName('-');
                setRobotMode('-');
                setAxleValues({});
                setRobotInfo({});
                setDebugInfo('🔌 Disconnected');
            }
        } catch (e) {
            setDebugInfo('❌ Failed to handle message: ' + String(e));
        }
    }, []);


    // Listen to socket.lastMessage
    useEffect(() => {
        if (!socket?.lastMessage) return;

        const { data, timeStamp } = socket.lastMessage;

        // Log every incoming message
        console.log('Websocket data:', data);

        if (typeof data === 'string') handleMessage(data);
    }, [socket?.lastMessage, handleMessage]);

    return (null);
}