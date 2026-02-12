import { useState, useEffect, useRef } from 'react';

import { Panel, Group } from 'react-resizable-panels'
import { Viewport } from "./components/viewport/Viewport";
import { useSceneState } from './hooks/useSceneState';
import { SocketProvider } from './hooks/use-socket';
import { UrlProvider } from './contexts/UrlContext';
import { useJointState } from "./hooks/useJointState";
import WebSocketReciever  from './components/WebsocketReciever';
import { LogProvider} from './contexts/LogContext';
import { LoadingProvider } from './contexts/LoadingContext';
import { RobotInfoProvider, AxleValues, RobotInfo } from './contexts/RobotInfoContext';
import useServersAndRobots from './hooks/useServersAndRobots';
import useIsMobile from './hooks/useIsMobile';
import MobilePanelControls from './components/MobilePanelControls';
import MessageLog from './components/MenuComponents/Tab2Components/MessageLog';
import { JointAnglesPanel } from "./components/MenuComponents/ControlsComponents/JointAnglesPanel";
import { ASpaceWindow } from './components/Adressspace/ASpaceWindow';
import RobotsServersManager from './components/AddServerAndRobots/RobotsServersManager';
import Settings from './components/Settings';

export type SettingsState = {
  environment: boolean;
  effectComposer: boolean;
};

function App() {
  
  const [settings, setSettings] = useState<SettingsState>({
      effectComposer: true,
      environment: true,
    });

  const toggleSettings = (key: keyof SettingsState) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  };
  
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

  const [logs, setLogs] = useState<string>("");
  const [opcuaUrl, setOpcuaUrl] = useState<string | null>(null);
  
  const [robotName, setRobotName] = useState('-');
  const [robotStatus, setRobotStatus] = useState('Not Connected');
  const [robotMode, setRobotMode] = useState('-');
  const [axleValues, setAxleValues] = useState<AxleValues>({});
  const [robotInfo, setRobotInfo] = useState<RobotInfo>({});

  const websocketUrl = "ws://127.0.0.1:8001/ws";

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


  const isMobile = useIsMobile();
  const [mobilePanelState, setMobilePanelState] = useState<'none'|'main'|'side'|'bot'>('none');

  useEffect(() => {
    const active = servers.find(s => s.id === activeASpaceServerId);
    setOpcuaUrl(active?.connectedUrl ?? null);
  }, [activeASpaceServerId, setOpcuaUrl]);

  return (
    <RobotInfoProvider robotName={robotName} robotInfo={robotInfo} robotMode={robotMode}
                 robotStatus={robotStatus} axleValues={axleValues}
                 setAxleValues={setAxleValues} setRobotInfo={setRobotInfo} setRobotMode={setRobotMode}
                 setRobotName={setRobotName} setRobotStatus={setRobotStatus}>
    <SocketProvider url={websocketUrl}>
    <LogProvider logs={logs} setLogs={setLogs}>
    <LoadingProvider>
    <UrlProvider url={opcuaUrl} setUrl={setOpcuaUrl}>
    <div className="w-full h-screen overflow-hidden">
      <MobilePanelControls className={`md:hidden flex items-center gap-2 mb-2 ${mobilePanelState !== 'none' ? 'hidden' : ''}`} mobilePanelState={mobilePanelState} setMobilePanelState={setMobilePanelState} showClose={false} />
      <WebSocketReciever jointManager={jointManager} />
      {!(isMobile && mobilePanelState !== 'none') ? (
      <Group orientation='vertical'>
      <header className='panel-header'>
        <div className='panel-title text-sm'>Digital Twin Robots</div>
        <Settings settings={settings} toggleSettings={toggleSettings} />
      </header>
        <Group>
        <Panel defaultSize="85%">
          <Group orientation="vertical">
            <Panel>
                <Group>
                  <Panel>
                   <JointAnglesPanel
                      jointManager={jointManager}
                      jointProperties={jointProperties}
                      showCollisionMesh={showCollisionMesh}
                      setShowCollisionMesh={setShowCollisionMesh}
                      reloadKey={reloadKey}
                      hoveredJointMesh={hoveredJointMesh}
                    />
                  </Panel>
                  <Panel defaultSize="85%">
                  <Viewport 
                    key={reloadKey}
                    urdfPath={selectedRobot.url}
                    jointManager={jointManager}
                    onJointLimitsLoaded={setJointLimits}
                    showCollisionMesh={showCollisionMesh}
                    setHoveredJointMesh={setHoveredJointMesh}
                    effectComposer={settings.effectComposer}
                    environment={settings.environment}
                  />
                  </Panel>   
              </Group>
            </Panel>
            <Panel defaultSize="35%">
            <div className="panel flex flex-col h-full">
              <header className="panel-header">
                <div className="flex items-center gap-4">
                  <div className='panel-title'>Servers:</div>
                  <nav className="panel-nav" role="tablist" aria-label="Address Space servers">
                    {servers.length ? servers.map(s => (
                      <button
                        key={s.id}
                        role="tab"
                        className="panel-tab"
                        aria-selected={s.id === activeASpaceServerId}
                        onClick={() => setActiveASpaceServerId(s.id)}
                        type="button"
                      >
                        {s.name}
                      </button>
                    )) : (
                      null
                    )}
                  </nav>
                </div>
              </header>
              <div className="panel-body flex-1 overflow-auto">
                <Group>
                  <Panel defaultSize="70%">
                    <ASpaceWindow />
                  </Panel>
                  <Panel>
                    <MessageLog />
                  </Panel>
                </Group>
              </div>
            </div>
            </Panel>
          </Group>
        </Panel>
        <Panel>
          <RobotsServersManager
            servers={servers}
            robots={robots}
            jointManager={jointManager}
            addServer={addServer}
            removeServer={removeServer}
            addRobot={addRobot}
            removeRobot={removeRobot}
            connectRobotToServer={connectRobotToServer}
            disconnectRobot={disconnectRobot}
            onSelectURDF={handleRobotSelect}
          />
        </Panel>
      </Group>
      </Group>
      ) : (
        <div className='px-2 py-2'>
          <div className="flex items-center justify-between mb-2 z-50">
            <Settings settings={settings} toggleSettings={toggleSettings} />
            <MobilePanelControls className="flex items-center gap-2" mobilePanelState={mobilePanelState} setMobilePanelState={setMobilePanelState} showClose={true} />
          </div>
          <div>
            {mobilePanelState === 'main' && (
              <div className="h-full gap-2 flex flex-col">
                <div className="w-full h-[60vh]">
                  <Viewport 
                    key={reloadKey}
                    urdfPath={selectedRobot.url}
                    jointManager={jointManager}
                    onJointLimitsLoaded={setJointLimits}
                    showCollisionMesh={showCollisionMesh}
                    setHoveredJointMesh={setHoveredJointMesh}
                    effectComposer={settings.effectComposer}
                    environment={settings.environment}
                  />
                </div>
                <div className="w-full z-50 max-h-[30vh] overflow-auto">
                  <JointAnglesPanel
                    jointManager={jointManager}
                    jointProperties={jointProperties}
                    showCollisionMesh={showCollisionMesh}
                    setShowCollisionMesh={setShowCollisionMesh}
                    reloadKey={reloadKey}
                    hoveredJointMesh={hoveredJointMesh}
                  />
                </div>
              </div>
            )}
            {mobilePanelState === 'side' && (
              <div className="flex flex-col gap-4">
                <RobotsServersManager
                  servers={servers}
                  robots={robots}
                  jointManager={jointManager}
                  addServer={addServer}
                  removeServer={removeServer}
                  addRobot={addRobot}
                  removeRobot={removeRobot}
                  connectRobotToServer={connectRobotToServer}
                  disconnectRobot={disconnectRobot}
                />
              </div>
            )}
            {mobilePanelState === 'bot' && (
              <div>
                <header className="panel-header">
                <div className="flex items-center gap-4">
                  <div className='panel-title'>Servers:</div>
                  <nav className="panel-nav" role="tablist" aria-label="Address Space servers">
                    {servers.length ? servers.map(s => (
                      <button
                        key={s.id}
                        role="tab"
                        className="panel-tab"
                        aria-selected={s.id === activeASpaceServerId}
                        onClick={() => setActiveASpaceServerId(s.id)}
                        type="button"
                      >
                        {s.name}
                      </button>
                    )) : (
                      null
                    )}
                  </nav>
                </div>
              </header>
                <ASpaceWindow />
                <MessageLog />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </UrlProvider>
    </LoadingProvider>
    </LogProvider>
    </SocketProvider>
    </RobotInfoProvider>
  )
}

export default App;
