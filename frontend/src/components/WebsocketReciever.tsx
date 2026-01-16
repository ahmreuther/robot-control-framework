import { useEffect, useState, useCallback, useContext } from 'react';
import { SocketContext } from '../hooks/use-socket';
import { useLogContext } from '../contexts/LogContext';
import { useRobotInfoContext} from '../contexts/RobotInfoContext';
import { JointStateManager, WRITER_ID } from '../hooks/useJointState';
import { UrlContext } from "../contexts/UrlContext";


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

    const {axleValues, setRobotName, setRobotStatus, setRobotMode, setAxleValues, setRobotInfo} = useRobotInfoContext();

    const { setLogs } = useLogContext();

    const {url, setUrl}  = useContext(UrlContext);

    //const [payloadJSON, setPayloadJSON] = useState<any>();


    function parseJson(input: string){
        try{
         return JSON.parse(input);
        }catch (e){
            console.warn("Parsing of JSON had a error", e)
        }
    }



    let opcUaSyncEnabled;
    let opcUaStreamActive;
    let hasRoboticsNamespace;



    // Handle every incoming WebSocket message
    const handleMessage = useCallback((msg: string) => {
        if (!msg) return;

        try {
            if(msg.startsWith('x|')){

                const match = msg.match(/^x\|([^:]+):(.+)$/);

                //const match = msg.match(/^x\|([^:]+):/);
                let prefix = match?.[1];
                let payload :any = match[2];
                switch(prefix){
                    case 'custom' :
                        try{
                            payload = parseJson(payload);
                            if(payload.nodeId && typeof payload.value !== "undefined"){
                                //updateSubscriptionTable(payloadJSON.nodeId, payloadJSON.value);
                            }
                            /*if (showSubscriptionsTabOnNextCustom) {
                            const tabBtn = document.querySelector('.tab-btn[data-tab="subscriptions"]');
                            if (tabBtn) tabBtn.click();
                            showSubscriptionsTabOnNextCustom = false;
                            }*/
                        } catch (e){
                            console.warn("Custom subscription parse error", e);
                        }
                        break;

                    case 'unsubscribe':
                        let nodeId = null;
                        
                        payload = payload.trim();
                        if (payload.startsWith("{")) {// Check whether JSON or plain nodeId:
                            // JSON
                            try {
                                payload = parseJson(payload);
                                nodeId = payload.nodeId;
                            } catch (e) {
                                console.warn("Unsubscribe parse error", e);
                            }   
                        } else {
                            // Only nodeId as a string
                            nodeId = payload;
                        }
                        if (nodeId) {
                            //removeSubscriptionRow(nodeId);
                        }
                        break;

                    case 'event':
                        try {
                             payload = parseJson(payload);
                            const eventsContainer = document.getElementById("tab-events");
                        
                            const p = document.createElement("p");
                            const timestamp = new Date().toLocaleTimeString();
                        
                            p.textContent = `[${timestamp}] ${JSON.stringify(payload, null, 2)}`;
                            p.style.fontFamily = "monospace";
                            p.style.whiteSpace = "pre-wrap";
                            p.style.borderBottom = "1px solid #ccc";
                            p.style.marginBottom = "5px";
                        
                            if (eventsContainer) {
                                // Remove “No events captured” if present
                                const noEvents = eventsContainer.querySelector('.no-events-captured');
                                if (noEvents) noEvents.remove();
                                eventsContainer.prepend(p);
                            }
                        } catch (e) {
                            console.warn("Event parse error", e);
                        }
                        break;

                    case 'robotinfo':
                        try {
                            payload = parseJson(payload);
                            console.log("Robot Info:", payload);
                            setRobotInfo(payload)
                            if (payload.model) setRobotName(payload.model);
                            setLogs(prev => prev + `✅ Robot info received\n`);

                        } catch (e) {
                            console.warn("Event parse error", e);
                        }
                        break;

                    case 'Mode':
                        if (typeof msg === "string") {
                            payload =payload.trim();
                            setRobotMode(payload);
                            setLogs(prev => prev + `✅ Mode: ${payload}\n`);

                        }else{
                            console.warn("x|Mode: command is not a string");
                        }
                        break;
                    
                    case 'angles':
                        if (typeof msg === "string") {
                            
                            payload = payload.replace(/'/g, '"');
                            payload = parseJson(payload);

                            if(payload?.angles) setAxleValues(payload.angles);
                            console.log('✅ Axle values updated');

                            /*
                            try {
                                payload = parseJson(payload);
                                if (!payloadJSON || typeof payloadJSON !== "object" || !payloadJSON.angles) {
                                    console.warn("❌ Parsed value is not a valid angles message:", payloadJSON);
                                    return;
                                }
                            } catch (e) {
                                console.warn("❌ Error parsing axis data:", payload, e);
                                return;
                            }
                            //lastOpcUaAngles = anglesMsg.angles;
                        
                            if (isManipulating) {
                            
                                //lastOpcUaAngles = anglesMsg.angles;
                                return;
                            }
                        
                            if (!viewer) viewer = document.querySelector('urdf-viewer');
                            if (!viewer || !viewer.robot || !viewer.robot.joints) {
                                console.warn("⚠️ URDF Viewer or Robot Joints not available.");
                                return;
                            }
                        
                        
                            try {
                                //buildAxisToJointMap(anglesMsg);
                                //console.log(buildAxisToJointMap(anglesMsg));
                            } catch (e) {
                                console.warn("❌ Could not create axis→joint mapping:", e);
                                return;
                            }
                        
                            const unit = payloadJSON.unit;
                            const jointValuesRad = {};
                            for (const axisName in payloadJSON.angles) {
                                const jointName = axisToJointMap[axisName];
                                if (!jointName) continue;
                            
                                let value = Number(payloadJSON.angles[axisName]) || 0;
                                if (unit && unit !== "C81") {
                                    // OPC delivers degree → convert to radiant
                                    value = value * Math.PI / 180;
                                }
                                // Radiant (C81 or null) → use directly
                                jointValuesRad[jointName] = value;
                            }
                            const success = viewer.setJointValues(jointValuesRad);
                            if (!success) {
                                console.warn("⚠️ viewer.setJointValues() did not cause any change.");
                            } else {
                                console.log("✅ Angle of joints updated:", jointValuesRad);
                            }*/
                        }
                        break;

                    default:
                        console.warn(prefix)
                        console.warn("Command not supported", msg);

                }

            }
                
            else{
                setLogs(prev => prev + `🔔Received: ${msg}\n`);

                if (msg.startsWith("Method call result:")) { //bis jetzt muss hier nichts gemacht werden, da die Nachricht bereits geloggt wird
                    //const methodStatus = document.getElementById('method-call-status');
                    //const spinner = document.getElementById('method-spinner');
                    //const statusText = document.getElementById('method-status-text');
                    //spinner.style.display = 'none';

                    //statusText.textContent = event.data.replace("Method call result:", "").trim();

                    //methodStatus.style.display = 'block';
                    //setTimeout(() => {
                    //    methodStatus.style.display = 'none';
                    //}, 6000);
 
                }
                if (msg.startsWith("✅ OPC UA server supports 'Robotics Namespace'")) {//hier muss bis jetzt noch nichts passieren wenn eine flag benötigt wird können wir diese hinzufügen
                    hasRoboticsNamespace = true
                    //updateRobotLockToggleVisibility(); 
                }
                if (msg.startsWith("❌ 'Robotics Namespace' not listed")) {//hier muss bis jetzt noch nichts passieren wenn eine flag benötigt wird können wir diese hinzufügen
                    hasRoboticsNamespace = false
                    //updateRobotLockToggleVisibility();
                }
                if (msg.startsWith("✅ Connected to ")) {
                    setUrl(msg.replace("✅ Connected to ", "").trim());
                    //loadDeviceSet(connectedUrl); //hier sollte das laden des namespaces geschehen
                    setRobotStatus('Connected');
                }
                if (msg.startsWith("Model:")) {
                    const lines = msg.split(/\r?\n/);
                    const modelLine = lines.find(line => line.startsWith("Model:"));
                    const serialLine = lines.find(line => line.startsWith("Serial Number:"));

                    const model = modelLine ? modelLine.replace("Model:", "").trim() : "unknown model";
                    const serial = serialLine ? serialLine.replace("Serial Number:", "").trim() : "unknown serial";

                    //TODO: Update robot stats box instead of opc-ua-status 
                    setRobotName(`${model}(${serial})`)
                    setRobotStatus('Connected');
                }
                if (msg.startsWith("🔌 Disconnected from ")) { // hier sollte der adressspace wieder geschlossen werden
                    const rec_url = msg.replace("🔌 Disconnected from ", "").trim();
                    if (url === rec_url) {
                        setUrl(null);
                    }
                    const subsTable = document.getElementById('subscriptions-table');
                    if (subsTable) {
                        const tbody = subsTable.querySelector('tbody');
                        if (tbody) tbody.innerHTML = '';
                    }
                    // SyncToggle auf false setzen
                    opcUaSyncEnabled = false;
                    opcUaStreamActive = false;
                    // Lock-Toggle 
                    hasRoboticsNamespace = null;
                    //updateRobotLockToggleVisibility();

                    setRobotStatus('Not Connected');
                    setRobotName('-');
                    setRobotMode('-');
                    setAxleValues({});
                    setRobotInfo({});
                }
                if (msg.startsWith("❌ No client found")) {
                    setRobotStatus('Not Connected');
                    setRobotName('-');
                    setRobotMode('-');
                }
                if (msg.startsWith('❌ Connection failed to')){
                    setUrl("");
                    setRobotStatus('Not Connected');
                    setRobotName('-');
                    setRobotMode('-');
                    setAxleValues({});
                    setRobotInfo({});
                }
            }
        } catch (e) {
            console.warn('❌ Failed to handle message: ' + String(e));
        }
    }, [setLogs, setRobotName, setRobotInfo, setRobotStatus, setRobotMode, setAxleValues]);

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