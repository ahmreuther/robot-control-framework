import { useCallback, useContext, useEffect } from 'react';

import { useLogContext } from '../contexts/LogContext';
import { useRobotInfoContext } from '../contexts/RobotInfoContext';
import { UrlContext } from '../contexts/UrlContext';
import { SocketContext } from '../hooks/use-socket';
import type { JointStateManager } from '../hooks/useJointState';
import { WRITER_ID } from '../hooks/useJointState';

const buildAxisToJointMap = (axisNames: string[], urdfJointNames: string[]) => {
  const sortedAxis = [...axisNames].sort((a, b) => {
    const ai = parseInt(a.match(/(\d+)$/)?.[1] || '0', 10);
    const bi = parseInt(b.match(/(\d+)$/)?.[1] || '0', 10);
    return ai - bi;
  });

  const n = Math.min(sortedAxis.length, urdfJointNames.length);
  const map: Record<string, string> = {};
  for (let i = 0; i < n; i += 1) {
    const axisName = sortedAxis[i];
    const jointName = urdfJointNames[i];
    if (!axisName || !jointName) continue;
    map[axisName] = jointName;
  }
  return map;
};

export interface WebSocketRecieverProps {
  jointManager: JointStateManager;
}

export default function WebSocketReciever({ jointManager }: WebSocketRecieverProps) {
  const socket = useContext(SocketContext);

  const {
    setRobotName,
    setRobotStatus,
    setRobotMode,
    setAxleValues,
    setRobotInfo,
    orderedJointNames,
  } = useRobotInfoContext();

  const { setLogs } = useLogContext();

  const { url, setUrl } = useContext(UrlContext);

  function parseJson(input: string) {
    try {
      return JSON.parse(input);
    } catch (e) {
      console.warn('Parsing of JSON had a error', e);
    }
  }

  const handleMessage = useCallback(
    (msg: string) => {
      if (!msg) return;

      try {
        if (msg.startsWith('x|')) {
          const match = /^x\|([^:]+):(.+)$/.exec(msg);
          if (!match) return;
          const prefix = match[1];
          let payload: any = match[2];

          switch (prefix) {
            case 'custom':
              try {
                payload = parseJson(payload);
                if (payload.nodeId && typeof payload.value !== 'undefined') {
                  //updateSubscriptionTable(payload.nodeId, payload.value);
                }
              } catch (e) {
                console.warn('Custom subscription parse error', e);
              }
              break;

            case 'unsubscribe': {
              let nodeId = null;
              payload = payload.trim();
              if (payload.startsWith('{')) {
                try {
                  payload = parseJson(payload);
                  nodeId = payload.nodeId;
                } catch (e) {
                  console.warn('Unsubscribe parse error', e);
                }
              } else {
                nodeId = payload;
              }
              if (nodeId) {
                //removeSubscriptionRow(nodeId);
              }
              break;
            }

            case 'event':
              try {
                payload = parseJson(payload);
                const eventsContainer = document.getElementById('tab-events');

                const p = document.createElement('p');
                const timestamp = new Date().toLocaleTimeString();

                p.textContent = `[${timestamp}] ${JSON.stringify(payload, null, 2)}`;
                p.style.fontFamily = 'monospace';
                p.style.whiteSpace = 'pre-wrap';
                p.style.borderBottom = '1px solid #ccc';
                p.style.marginBottom = '5px';

                if (eventsContainer) {
                  const noEvents = eventsContainer.querySelector('.no-events-captured');
                  if (noEvents) noEvents.remove();
                  eventsContainer.prepend(p);
                }
              } catch (e) {
                console.warn('Event parse error', e);
              }
              break;

            case 'robotinfo':
              try {
                payload = parseJson(payload);
                console.log('Robot Info:', payload);
                setRobotInfo(payload);
                if (payload.model) setRobotName(payload.model);
                setLogs((prev: string) => prev + `✅ Robot info received\n`);
              } catch (e) {
                console.warn('RobotInfo parse error', e);
              }
              break;

            case 'Mode':
              if (typeof msg === 'string') {
                payload = payload.trim();
                setRobotMode(payload);
                setLogs((prev: string) => prev + `✅ Mode: ${payload}\n`);
              } else {
                console.warn('x|Mode: command is not a string');
              }
              break;

            case 'angles':
              if (typeof msg === 'string') {
                payload = payload.replace(/'/g, '"');
                payload = parseJson(payload);

                if (payload?.angles) setAxleValues(payload.angles);
                console.log('✅ Axle values updated');

                if (payload?.angles && orderedJointNames.length) {
                  const axisNames = Object.keys(payload.angles as Record<string, number>);
                  const map = buildAxisToJointMap(axisNames, orderedJointNames);

                  const unit = payload.unit;
                  const nextAngles = orderedJointNames.map(() => 0);

                  Object.entries(payload.angles as Record<string, number>).forEach(
                    ([axisName, axisValue]) => {
                      const jointName = map[axisName];
                      if (!jointName) return;
                      const jointIndex = orderedJointNames.indexOf(jointName);
                      if (jointIndex < 0) return;

                      let value = Number(axisValue) || 0;
                      if (unit && unit !== 'C81') {
                        value = (value * Math.PI) / 180;
                      }
                      nextAngles[jointIndex] = value;
                    },
                  );

                  jointManager.setAngles(WRITER_ID.SYN, nextAngles);
                }
              }
              break;

            default:
              console.warn('Command not supported', prefix);
          }
        } else {
          setLogs((prev: string) => prev + `🔔Received: ${msg}\n`);

          if (msg.startsWith('Method call result:')) {
            //bis jetzt muss hier nichts gemacht werden, da die Nachricht bereits geloggt wird
          }
          if (msg.startsWith("✅ OPC UA server supports 'Robotics Namespace'")) {
            //updateRobotLockToggleVisibility();
          }
          if (msg.startsWith("❌ 'Robotics Namespace' not listed")) {
            //updateRobotLockToggleVisibility();
          }
          if (msg.startsWith('✅ Connected to ')) {
            setUrl(msg.replace('✅ Connected to ', '').trim());
            setRobotStatus('Connected');
          }
          if (msg.startsWith('Model:')) {
            const lines = msg.split(/\r?\n/);
            const modelLine = lines.find((line) => line.startsWith('Model:'));
            const serialLine = lines.find((line) => line.startsWith('Serial Number:'));

            const model = modelLine ? modelLine.replace('Model:', '').trim() : 'unknown model';
            const serial = serialLine
              ? serialLine.replace('Serial Number:', '').trim()
              : 'unknown serial';

            setRobotName(`${model}(${serial})`);
            setRobotStatus('Connected');
          }
          if (msg.startsWith('🔌 Disconnected from ')) {
            const rec_url = msg.replace('🔌 Disconnected from ', '').trim();
            if (url === rec_url) {
              setUrl(null);
            }
            const subsTable = document.getElementById('subscriptions-table');
            if (subsTable) {
              const tbody = subsTable.querySelector('tbody');
              if (tbody) tbody.innerHTML = '';
            }

            setRobotStatus('Not Connected');
            setRobotName('-');
            setRobotMode('-');
            setAxleValues({});
            setRobotInfo({});
          }
          if (msg.startsWith('❌ No client found')) {
            setRobotStatus('Not Connected');
            setRobotName('-');
            setRobotMode('-');
          }
          if (msg.startsWith('❌ Connection failed to')) {
            setUrl('');
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
    },
    [
      setLogs,
      setRobotName,
      setRobotInfo,
      setRobotStatus,
      setRobotMode,
      setAxleValues,
      orderedJointNames,
      jointManager,
      url,
      setUrl,
    ],
  );

  useEffect(() => {
    if (!socket?.lastMessage) return;
    const { data } = socket.lastMessage;
    if (typeof data === 'string') handleMessage(data);
  }, [socket?.lastMessage, handleMessage]);

  return null;
}
