import { createContext, useState } from 'react';
import './App.css';

import Live_Status from './components/Live_Status';
import { Viewport } from "./components/Viewport";
import {type URDFOptions } from './components/MenuComponents/ControlsComponents/URDFSelector';
import { SidebarMenu } from './components/Menu';
import { SocketProvider } from './hooks/use-socket';
import { UrlProvider } from './components/UrlContext';

// Example robot options
const robotOptions: URDFOptions[] = [
  { urdf: '/urdf/eva_description/urdf/eva_description.urdf', color: '#aaaab3', label: 'EVA Automata' },
  { urdf: '/urdf/fr3_description/urdf/fr3.urdf', color: '#aaaab3', label: 'Franka Research 3' },
  { urdf: '/urdf/fr3_description_with_wagon/ur3.urdf', color: '#aaaab3', label: 'Franka Research 3 & Wagon' },
  { urdf: '/urdf/ur5_description/ur5_robot.urdf', color: '#aaaab3', label: 'UR5e' },
];

// Create context for logs
export const LogContext = createContext<{
  logs: string;
  setLogs: React.Dispatch<React.SetStateAction<string>>;
}>({
  logs: '',
  setLogs: () => {}
});

function App() {
  
  const [selectedRobot, setSelectedRobot] = useState<URDFOptions>(robotOptions[0]);
  const [logs, setLogs] = useState("Start of logs...\n");
  const [opcuaUrl, setOpcuaUrl] = useState<string | null>(null);
  
  const logWrapper = {logs, setLogs};
  

  return (
    <UrlProvider url={opcuaUrl} setUrl={setOpcuaUrl}>
      <SocketProvider url='ws://127.0.0.1:8000/ws'>
        <LogContext.Provider value={logWrapper}>
          <div className="h-screen flex">
            <SidebarMenu options={robotOptions} onSelect={setSelectedRobot} />
            <Live_Status />
            <Viewport urdfPath={selectedRobot.urdf} />
          </div>
        </LogContext.Provider>
      </SocketProvider>
    </UrlProvider>
  )
}

export default App;
