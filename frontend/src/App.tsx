import { useState, useEffect, useRef } from 'react';
import './App.css';

import { Panel, Group } from 'react-resizable-panels'
import { Viewport } from "./components/viewport/Viewport";
import { SidebarMenu } from './components/Menu';
import RobotsServersManager from './components/RobotsServersManager';
import { useSceneState } from './hooks/useSceneState';
import { SocketProvider } from './hooks/use-socket';
import { UrlProvider } from './contexts/UrlContext';
import { useJointState } from "./hooks/useJointState";
import WebSocketReciever  from './components/WebsocketReciever';
import { LogProvider} from './contexts/LogContext';
import { RobotInfoProvider, AxleValues, RobotInfo } from './contexts/RobotInfoContext';
import useServersAndRobots from './hooks/useServersAndRobots';
import MessageLog from './components/MenuComponents/Tab2Components/MessageLog';
import Twin_Dashboard from './components/MenuComponents/TwinDashboardComponents/Twin_Dashboard';
import Live_Status from './components/MenuComponents/TwinDashboardComponents/Live_Status';
import { JointAnglesPanel } from "./components/MenuComponents/ControlsComponents/JointAnglesPanel";

function App() {
  
  const jointManager = useJointState();

  const {
    selectedRobot,
    reloadKey,
    handleRobotSelect,
    setJointLimits,
    jointProperties,
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

  const {
    servers,
    robots,
    addServer,
    removeServer,
    addRobot,
    removeRobot,
    connectRobotToServer,
    disconnectRobot,
    activeASpaceServerId,
    setActiveASpaceServerId,
  } = useServersAndRobots();

  return (
    <div className="w-screen h-screen overflow-hidden bg-black text-white p-4">
      <div>
        Settings
      </div>
        <Group>
        <Panel defaultSize="90%">
          <Group orientation="vertical">
            <Panel>
                <Group>
                  <Panel defaultSize="20%">
                    <JointAnglesPanel
                      jointManager={jointManager}
                      jointProperties={jointProperties}
                      showCollisionMesh={showCollisionMesh}
                      setShowCollisionMesh={setShowCollisionMesh}
                      reloadKey={reloadKey}
                      hoveredJointMesh={hoveredJointMesh}
                    />
                  </Panel>
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
              </Group>
            </Panel>
              <div className="flex">
                <span>Servers:</span>
                <nav className="flex items-center gap-2" role="tablist" aria-label="Address Space servers">
                  {servers.length ? servers.map(s => (
                    <button
                      key={s.id}
                      role="tab"
                      className={`${s.id === activeASpaceServerId ? 'border-2 border-blue-500' : ''}`}
                      aria-selected={s.id === activeASpaceServerId}
                      onClick={() => setActiveASpaceServerId(s.id)}
                    >
                      {s.name}
                    </button>
                  )) : (
                    null
                  )}
                </nav>
              </div>
            <Panel defaultSize="20%">
              <Group>
                <Panel defaultSize="70%">
                  Aspace
                </Panel>
                <Panel>
                  <MessageLog />
                </Panel>
              </Group>
            </Panel>
          </Group>
        </Panel>
        <Panel>
          <RobotsServersManager
            servers={servers}
            robots={robots}
            addServer={addServer}
            removeServer={removeServer}
            addRobot={addRobot}
            removeRobot={removeRobot}
            connectRobotToServer={connectRobotToServer}
            disconnectRobot={disconnectRobot}
          />
          <Live_Status />
          <Twin_Dashboard /> 
        </Panel>
      </Group>
    </div>
  )
}

export default App;
