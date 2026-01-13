import { createContext, useState } from 'react';
import './App.css';

import { Panel, Group } from 'react-resizable-panels'
import { Viewport } from "./components/viewport/Viewport";
import {type ModelConfig } from './components/MenuComponents/ControlsComponents/URDFSelector';
import { SidebarMenu } from './components/Menu';
import { SocketProvider } from './hooks/use-socket';
import { UrlProvider } from './contexts/UrlContext';
import { useJointState } from "./hooks/useJointState";
import WebSocketReciever  from './components/WebsocketReciever';
import { LogContext } from './contexts/LogContext';
import { RobotInfoContext, RobotInfoProvider, AxleValues, RobotInfo } from './contexts/RobotInfoContext';

const ROBOT_MODELS: ModelConfig[] = [
  { id: 'eva', label: 'EVA Automata', url: '/urdf/eva_description/urdf/eva_description.urdf' },
  { id: 'fr3', label: 'Franka Research 3', url: '/urdf/fr3_description/urdf/fr3.urdf' },
  { id: 'fr3_wagon', label: 'Franka Research 3 with Wagon', url: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf' },
  { id: 'ur5e', label: 'UR5e', url: '/urdf/ur5_description/urdf/ur5_robot.urdf' },
];


function App() {

  //initSocket("ws://127.0.0.1:8000/ws"); //initialize WebSocket connection

  const {
    jointAngles,
    setJointsAngles,
    fkMode,
    setFkMode
  } = useJointState();

  const [selectedRobot, setSelectedRobot] = useState(ROBOT_MODELS[0]);
  const [reloadKey, setReloadKey] = useState(0);

  const handleRobotSelect = (robot: ModelConfig) => {
    setFkMode(false);
    setSelectedRobot(robot);
    setReloadKey(prev => prev + 1);
  };

  const [logs, setLogs] = useState('');
  const [opcuaUrl, setOpcuaUrl] = useState<string | null>(null);
  
  const [robotName, setRobotName] = useState('-');
  const [robotStatus, setRobotStatus] = useState('Not Connected');
  const [robotMode, setRobotMode] = useState('-');
  const [axleValues, setAxleValues] = useState<AxleValues>({});
  const [robotInfo, setRobotInfo] = useState<RobotInfo>({});
  const [debugInfo, setDebugInfo] = useState('Initializing...');


  const logWrapper = {logs, setLogs};

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#202025] text-white">
      <Group>
        <Panel defaultSize="20%">
          <UrlProvider url={opcuaUrl} setUrl={setOpcuaUrl}>
            <SocketProvider url='ws://127.0.0.1:8001/ws'>
              <LogContext.Provider value={logWrapper}>
                <RobotInfoProvider robotName={robotName} robotInfo={robotInfo} robotMode={robotMode}
                 robotStatus={robotStatus} axleValues={axleValues} debugInfo={debugInfo}
                 setAxleValues={setAxleValues} setDebugInfo={setDebugInfo} setRobotInfo={setRobotInfo} setRobotMode={setRobotMode}
                 setRobotName={setRobotName} setRobotStatus={setRobotStatus}>
                <WebSocketReciever/>
                <div className="flex flex-col h-full bg-[#202025]">
                  <SidebarMenu
                    options={ROBOT_MODELS} 
                    onSelect={handleRobotSelect} 
                    jointAngles={jointAngles}
                    setFkMode={setFkMode}
                    setJointAngles={setJointsAngles}
                  />
                </div>
                </RobotInfoProvider>
              </LogContext.Provider>
            </SocketProvider>
          </UrlProvider>
        </Panel>
        <Panel defaultSize="80%">
          <div className="relative h-full">
            <Viewport 
              key={reloadKey}
              urdfPath={selectedRobot.url}
              setJointAngles={setJointsAngles}
              setFkMode={setFkMode}
              jointAngles={jointAngles}
              fkMode={fkMode}
            />
          </div>
        </Panel>
      </Group>
    </div>
  )
}

export default App;
