import { useState, useEffect } from 'react';
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

  const removeServer = (serverId: number) => {
    setServers(prev => {
      const newServers = prev.filter(s => s.id !== serverId);
      if (activeASpaceServerId === serverId) {
        setActiveASpaceServerId(newServers.length ? newServers[0].id : null);
      }
      return newServers;
    });

    setRobots(prev => prev.map(r => r.serverId === serverId ? { ...r, serverId: null } : r));
    setServerIdCounter(id => id - 1);
  };

  const addRobot = (name: string) => {
    setRobots(prev => [...prev, { id: robotIdCounter, name, serverId: null }]);
    setRobotIdCounter(id => id + 1);
  };

  const removeRobot = (robotId: number) => {
    setRobots(prev => prev.filter(r => r.id !== robotId));
    setServers(prev => prev.map(s => ({ ...s, robotIds: s.robotIds.filter(id => id !== robotId) })));
    setRobotIdCounter(id => id - 1);
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

  const [activeASpaceServerId, setActiveASpaceServerId] = useState<number | null>(null);

  useEffect(() => {
    if (servers.length && activeASpaceServerId === null) {
      setActiveASpaceServerId(servers[0].id);
    } else if (!servers.length) {
      setActiveASpaceServerId(null);
    }
  }, [servers]);

  const [serversOpen, setServersOpen] = useState(true);
  const [robotsOpen, setRobotsOpen] = useState(true);

  return (
    <div className="w-screen h-screen overflow-hidden bg-black text-white p-4">
      <div>
        Settings
      </div>
      <Group>
        <Panel defaultSize="80%">
          <Group orientation="vertical">
            <Panel>
              <div className="relative h-full">
                <Viewport 
                  key={reloadKey}
                  urdfPath={selectedRobot.url}
                  jointManager={jointManager}
                  onJointLimitsLoaded={setJointLimits}
                  showCollisionMesh={showCollisionMesh}
                  setHoveredJointMesh={setHoveredJointMesh}
                />
              </div>
            </Panel>
              <div>
                Server: {activeASpaceServerId !== null ? servers.find(s => s.id === activeASpaceServerId)?.name : 'None'}
              </div>
            <Panel defaultSize="30%">
              <Group>
              <Panel>
                Aspace
              </Panel>
              <Panel>
                MessageLog
              </Panel>
              </Group>
            </Panel>
          </Group>
        </Panel>
        <Panel>
          <div className="flex flex-col">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Servers</h2>
                <button
                  className="text-sm"
                  onClick={() => setServersOpen(prev => !prev)}
                  aria-expanded={serversOpen}
                >
                  {serversOpen ? '▼' : '▶'}
                </button>
              </div>
              {serversOpen && (
                <div>
                  <div>
                    <input
                      className="w-full"
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
                  </div>
                  {servers.map(server => (
                    <div key={server.id}>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{server.name} (ID: {server.id})</div>
                        <div className="flex">
                          <button
                            className="text-sm"
                            onClick={() => setActiveASpaceServerId(server.id)}
                          >
                            Select
                          </button>
                          <button
                            className="text-sm"
                            onClick={() => removeServer(server.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      <div>Connected Robots:
                      <ul>
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
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Robots</h2>
                <button
                  className="text-sm"
                  onClick={() => setRobotsOpen(prev => !prev)}
                  aria-expanded={robotsOpen}
                >
                  {robotsOpen ? '▼' : '▶'}
                </button>
              </div>

              {robotsOpen && (
                <div>
                  <div>
                    <input
                      className="w-full"
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
                  </div>
                  {robots.map(robot => (
                    <div key={robot.id}>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{robot.name} (ID: {robot.id})</div>
                        <button
                          className="text-sm"
                          onClick={() => removeRobot(robot.id)}
                        >
                          Remove
                        </button>
                      </div>

                      <div>
                        Connected to server:
                        <span>
                          {servers.find(s => s.id === robot.serverId)?.name} (ID: {robot.serverId})
                        </span>
                        <select
                          id={`connect-server-${robot.id}`}
                          className="text-black"
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
              )}
            </div>
          </div>
          <div>
            Dashboard
          </div>
          <div>Live Status with Syn button?</div>
        </Panel>
      </Group>
    </div>
  )
}

export default App;
