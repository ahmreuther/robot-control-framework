import { useEffect, useState, useCallback, useContext } from 'react';
import { SocketContext } from '../hooks/use-socket';
import { useLogContext } from '../contexts/LogContext';
import { useRobotInfoContext} from '../contexts/RobotInfoContext';
import { JointStateManager, WRITER_ID } from '../hooks/useJointState';

type AxleValues = Record<string, number>;

type RobotInfo = {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    gotoMethodNodeId?: string;
    toggleEndEffMethodNodeId?: string | null;
};

// Helper: Convert Record<string, number> to number[]
const recordToArray = (record: Record<string, number>): number[] => {
    return Object.values(record).sort((a, b) => {
        const aKey = Object.keys(record).find(k => record[k] === a) || '';
        const bKey = Object.keys(record).find(k => record[k] === b) || '';
        return aKey.localeCompare(bKey);
    });
};

export interface WebSocketRecieverProps {
    jointManager: JointStateManager
}

export default function WebSocketReciever({ jointManager }: WebSocketRecieverProps) {
    
    const socket = useContext(SocketContext);

    const {axleValues, setRobotName, setRobotStatus, setRobotMode, setAxleValues, setRobotInfo, setDebugInfo} = useRobotInfoContext();

    const { setLogs } = useLogContext();

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
                if (parsed?.angles) setAxleValues(parsed.angles);
                setDebugInfo('✅ Axle values updated');
            } else if (msg.startsWith('Robot info sent:')) {
                const payload = JSON.parse(msg.replace('Robot info sent:', '').trim());
                setRobotInfo(payload);
                if (payload.model) setRobotName(payload.model);
                setRobotStatus('Connected');
                setDebugInfo('✅ Robot info received');
            } else if (msg.startsWith('Axle values collected:')) {
                const parsed = JSON.parse(msg.replace('Axle values collected:', '').replace(/'/g, '"'));
                setAxleValues(parsed);
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
    }, [setLogs, setRobotName, setRobotInfo, setRobotStatus, setRobotMode, setAxleValues, setDebugInfo]);

    // Effect 1: Process WebSocket messages
    useEffect(() => {
        if (!socket?.lastMessage) return;
        const { data } = socket.lastMessage;
        console.log('Websocket data:', data);
        if (typeof data === 'string') handleMessage(data);
    }, [socket?.lastMessage, handleMessage]);

    // Effect 2: Update jointManager when axleValues change
    useEffect(() => {
        console.log('Axle Values in WebSocketReciever:', axleValues);
        jointManager.setAngles(WRITER_ID.SYN, recordToArray(axleValues))
    }, [axleValues, jointManager]);

    return (null);
}