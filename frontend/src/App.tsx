import { createContext, useState } from 'react';
import './App.css';

import { Panel, Group } from 'react-resizable-panels'
import Live_Status from './components/Live_Status';
import { Viewport } from "./components/viewport/Viewport";
import {type ModelConfig } from './components/MenuComponents/ControlsComponents/URDFSelector';
import { SidebarMenu } from './components/Menu';
import { SocketProvider } from './hooks/use-socket';
import { UrlProvider } from './components/UrlContext';
import { useJointState } from "./components/hooks/useJointState";

const ROBOT_MODELS: ModelConfig[] = [
  { id: 'eva', label: 'EVA Automata', url: '/urdf/eva_description/urdf/eva_description.urdf' },
  { id: 'fr3', label: 'Franka Research 3', url: '/urdf/fr3_description/urdf/fr3.urdf' },
  { id: 'fr3_wagon', label: 'Franka Research 3 with Wagon', url: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf' },
  { id: 'ur5e', label: 'UR5e', url: '/urdf/ur5_description/urdf/ur5_robot.urdf' },
];

// Create context for logs
export const LogContext = createContext<{
  logs: string;
  setLogs: React.Dispatch<React.SetStateAction<string>>;
}>({
  logs: '',
  setLogs: () => {}
});

// Create context for logs
export const LogContext = createContext<{
  logs: string;
  setLogs: React.Dispatch<React.SetStateAction<string>>;
}>({
  logs: '',
  setLogs: () => {}
});

function App() {

  const [count, setCount] = useState(0)
  
  const [selectedRobot, setSelectedRobot] = useState<URDFOptions>(robotOptions[0]); // Default to first robot(EVA Automata)

  initSocket("ws://127.0.0.1:8000/ws"); //initialize WebSocket connection

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

  const [logs, setLogs] = useState("Start of logs...\n");
  const [opcuaUrl, setOpcuaUrl] = useState<string | null>(null);
  
  const logWrapper = {logs, setLogs};

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#202025] text-white">
      <Group>
        <Panel defaultSize="15%">
          <UrlProvider url={opcuaUrl} setUrl={setOpcuaUrl}>
            <SocketProvider url='ws://127.0.0.1:8000/ws'>
              <LogContext.Provider value={logWrapper}>
                <div className="flex flex-col gap-4 p-5 h-full bg-[#1a1a1f]">
                  <SidebarMenu/>
                  <URDFSelector 
                    options={ROBOT_MODELS} 
                    onSelect={handleRobotSelect} 
                  />
                  <JointAnglesPanel
                    jointAngles={jointAngles}
                    setFkMode={setFkMode}
                    setJointAngles={setJointsAngles}
                  />
                  <Live_Status />
                </div>
              </LogContext.Provider>
            </SocketProvider>
          </UrlProvider>
        </Panel>
        <Panel defaultSize="85%">
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
