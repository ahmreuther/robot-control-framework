import { createContext, useState } from 'react';
import './App.css';

import { Panel, Group } from 'react-resizable-panels'
import { Viewport } from "./components/viewport/Viewport";
import { SidebarMenu } from './components/Menu';

import { useSceneState } from './hooks/useSceneState';
import { SocketProvider } from './hooks/use-socket';
import { UrlProvider } from './components/UrlContext';
import { useJointState } from "./hooks/useJointState";


// Create context for logs
export const LogContext = createContext<{
  logs: string;
  setLogs: React.Dispatch<React.SetStateAction<string>>;
}>({
  logs: '',
  setLogs: () => {}
});

function App() {

  const {
    jointAngles,
    setJointsAngles,
    fkMode,
    setFkMode
  } = useJointState();

  const {
    selectedRobot,
    reloadKey,
    handleRobotSelect,
    setJointLimits,
    jointLimits,
    options
  } = useSceneState();

  const [logs, setLogs] = useState("Start of logs...\n");
  const [opcuaUrl, setOpcuaUrl] = useState<string | null>(null);
  
  const logWrapper = {logs, setLogs};

  return (
    <div className="w-screen h-screen overflow-hidden bg-black text-white">
      <Group>
        <Panel defaultSize="20%">
          <UrlProvider url={opcuaUrl} setUrl={setOpcuaUrl}>
            <SocketProvider url='ws://127.0.0.1:8000/ws'>
              <LogContext.Provider value={logWrapper}>
                <div className="flex flex-col h-full bg-black">
                  <SidebarMenu
                    options={options} 
                    onSelect={(robot) => handleRobotSelect(robot, setFkMode)} 
                    jointAngles={jointAngles}
                    setFkMode={setFkMode}
                    setJointAngles={setJointsAngles}
                    jointLimits={jointLimits}
                  />
                </div>
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
              onJointLimitsLoaded={setJointLimits}  // Add this line
            />
          </div>
        </Panel>
      </Group>
    </div>
  )
}

export default App;
