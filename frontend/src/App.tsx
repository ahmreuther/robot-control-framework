import { useState } from 'react';
import './App.css';

import { Panel, Group } from 'react-resizable-panels'
import { Viewport } from "./components/viewport/Viewport";
import { SidebarMenu } from './components/Menu';
import { useSceneState } from './hooks/useSceneState';
import { SocketProvider } from './hooks/use-socket';
import { UrlProvider } from './contexts/UrlContext';
import { useJointState } from "./hooks/useJointState";
import WebSocketReciever  from './components/WebsocketReciever';
import { LogProvider} from './contexts/LogContext';
import { RobotInfoProvider, AxleValues, RobotInfo } from './contexts/RobotInfoContext';

function App() {
  
  const jointManager = useJointState();

  const {
    selectedRobot,
    reloadKey,
    handleRobotSelect,
    setJointLimits,
    jointLimits,
    options,
    showCollisionMesh,
    setShowCollisionMesh,
    hoveredJointMesh,
    setHoveredJointMesh,
  } = useSceneState();

  const [logs, setLogs] = useState('');
  const [opcuaUrl, setOpcuaUrl] = useState<string | null>(null);
  
  const [robotName, setRobotName] = useState('-');
  const [robotStatus, setRobotStatus] = useState('Not Connected');
  const [robotMode, setRobotMode] = useState('-');
  const [axleValues, setAxleValues] = useState<AxleValues>({});
  const [robotInfo, setRobotInfo] = useState<RobotInfo>({});

  type Robot = {
    id: number;
    name: string;
    serverId: number | null;
  };

  type Server = {
    id: number;
    name: string;
    robotIds: number[];
  };

  const [servers, setServers] = useState<Server[]>([]);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [serverIdCounter, setServerIdCounter] = useState(1);
  const [robotIdCounter, setRobotIdCounter] = useState(1);

  const addServer = (name: string) => {
    setServers(prev => [...prev, { id: serverIdCounter, name, robotIds: [] }]);
    setServerIdCounter(id => id + 1);
  };

  const addRobot = (name: string) => {
    setRobots(prev => [...prev, { id: robotIdCounter, name, serverId: null }]);
    setRobotIdCounter(id => id + 1);
  };

  const connectRobotToServer = (robotId: number, serverId: number) => {
    const prevRobot = robots.find(r => r.id === robotId);
    const prevServerId = prevRobot?.serverId;

    setRobots(prev => prev.map(r => r.id === robotId ? { ...r, serverId } : r));
    setServers(prev => prev.map(s => {
      if (s.id === serverId) {
        return { ...s, robotIds: [...s.robotIds, robotId] };
      } else if (s.id === prevServerId) {
        return { ...s, robotIds: s.robotIds.filter(id => id !== robotId) };
      } else {
        return s;
      }
    }));
  };

  const disconnectRobot = (robotId: number) => {
    const robot = robots.find(r => r.id === robotId);
    if (!robot || robot.serverId === null) return;
    setRobots(prev => prev.map(r => r.id === robotId ? { ...r, serverId: null } : r));
    setServers(prev => prev.map(s =>
      s.id === robot.serverId
        ? { ...s, robotIds: s.robotIds.filter(id => id !== robotId) }
        : s
    ));
  };

  const [newServerName, setNewServerName] = useState('');
  const [newRobotName, setNewRobotName] = useState('');

  return (
    <div className="w-screen h-screen overflow-hidden bg-black text-white p-4">
      <div className="mb-4 flex gap-8">
        <div>
          <input
            className="px-2 py-1 rounded mr-2"
            type="text"
            placeholder="Server name"
            value={newServerName}
            onChange={e => setNewServerName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                addServer(newServerName.trim());
                setNewServerName('');
                  e.currentTarget.blur();
              }
            }}
          />
          <span className="px-3 py-1 rounded">Add Server</span>
        </div>
        <div>
          <input
            className="px-2 py-1 rounded mr-2"
            type="text"
            placeholder="Robot name"
            value={newRobotName}
            onChange={e => setNewRobotName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                addRobot(newRobotName.trim());
                setNewRobotName('');
                  e.currentTarget.blur();
              }
            }}
          />
          <span className="px-3 py-1 rounded">Add Robot</span>
        </div>
      </div>
      <div className="flex gap-8">
        <div className="border p-4 rounded w-1/2">
          <h2 className="text-lg font-bold mb-2">Servers</h2>
          {servers.map(server => (
            <div key={server.id} className="mb-4 border p-2 rounded">
              <div className="font-semibold">{server.name} (ID: {server.id})</div>
              <div className="ml-2">Connected Robots:</div>
              <ul className="ml-4">
                {server.robotIds.map(rid => {
                  const robot = robots.find(r => r.id === rid);
                  return robot ? (
                    <li key={rid}>
                      {robot.name} (ID: {robot.id})
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="border p-4 rounded w-1/2">
          <h2 className="text-lg font-bold mb-2">Robots</h2>
          {robots.map(robot => (
            <div key={robot.id} className="mb-4 border p-2 rounded">
              <div className="font-semibold">{robot.name} (ID: {robot.id})</div>
              <div>
                Connected to server:
                  <span className="font-bold text-blue-400">
                    {servers.find(s => s.id === robot.serverId)?.name} (ID: {robot.serverId})
                  </span>
                <select
                  id={`connect-server-${robot.id}`}
                  className="ml-2 text-black px-2 py-1 rounded"
                  value={robot.serverId ?? ''}
                  onChange={e => {
                    const value = e.target.value;
                    if (value === "") {
                      disconnectRobot(robot.id);
                    } else {
                      const sid = Number(value);
                      if (sid) connectRobotToServer(robot.id, sid);
                    }
                  }}
                >
                  <option value="">None</option>
                  {servers.map(server => (
                    <option key={server.id} value={server.id}>{server.name} (ID: {server.id})</option>
                  ))}
                  
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App;
