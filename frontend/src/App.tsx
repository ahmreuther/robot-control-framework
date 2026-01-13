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
import { OPCUAAddressSpace } from './components/OPCUAAdressspace';


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

  const [logs, setLogs] = useState('');
  const [opcuaUrl, setOpcuaUrl] = useState<string | null>(null);
  
  const [robotName, setRobotName] = useState('-');
  const [robotStatus, setRobotStatus] = useState('Not Connected');
  const [robotMode, setRobotMode] = useState('-');
  const [axleValues, setAxleValues] = useState<AxleValues>({});
  const [robotInfo, setRobotInfo] = useState<RobotInfo>({});
  const [debugInfo, setDebugInfo] = useState('Initializing...');

  return (
    <div className="w-screen h-screen overflow-hidden bg-black text-white">
      <Group>
        <Panel defaultSize="20%">
          <UrlProvider url={opcuaUrl} setUrl={setOpcuaUrl}>
            <SocketProvider url='ws://127.0.0.1:8001/ws'>
              <LogProvider logs={logs} setlogs={setLogs}>
                <RobotInfoProvider robotName={robotName} robotInfo={robotInfo} robotMode={robotMode}
                 robotStatus={robotStatus} axleValues={axleValues} debugInfo={debugInfo}
                 setAxleValues={setAxleValues} setDebugInfo={setDebugInfo} setRobotInfo={setRobotInfo} setRobotMode={setRobotMode}
                 setRobotName={setRobotName} setRobotStatus={setRobotStatus}>
                <WebSocketReciever/>
                  <div className="flex flex-col h-full bg-black">
                  <SidebarMenu
                    options={options}
                    onSelect={(robot) => handleRobotSelect(robot, setFkMode)}
                    jointAngles={jointAngles}
                    setFkMode={setFkMode}
                    setJointAngles={setJointsAngles}
                    jointLimits={jointLimits}
                  />
                  <OPCUAAddressSpace />
                </div>
                </RobotInfoProvider>
              </LogProvider>
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
