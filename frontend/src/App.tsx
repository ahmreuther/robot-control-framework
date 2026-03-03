import { useEffect } from 'react';

import { useAppShellState } from './app/hooks/useAppShellState';
import { DesktopLayout } from './app/layout/DesktopLayout';
import { MobileLayout } from './app/layout/MobileLayout';
import { AppProviders } from './app/providers/AppProviders';
import logoPlcm from './assets/Logo_PLCM_RGB_mit Text.svg';
import MobilePanelControls from './components/MobilePanelControls';
import MessageController from './components/viewport/MessageController';
import WebSocketReceiver from './components/WebSocketReceiver';
import { useUrlContext } from './contexts/UrlContext';
import { useJointState } from './hooks/useJointState';
import { useSceneState } from './hooks/useSceneState';
import useServersAndRobots from './hooks/useServersAndRobots';

function AppShell() {
  const jointManager = useJointState();
  const {
    selectedRobot,
    reloadKey,
    handleRobotSelect,
    setJointLimits,
    jointProperties,
    showCollisionMesh,
    setShowCollisionMesh,
    hoveredJointMesh,
    setHoveredJointMesh,
  } = useSceneState();

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

  const {
    settings,
    toggleSettings,
    mobilePanelState,
    setMobilePanelState,
    pendingJoints,
    setPendingJoints,
    isMobile,
  } = useAppShellState();

  const { setUrl } = useUrlContext();

  useEffect(() => {
    const activeServer = servers.find((server) => server.id === activeASpaceServerId);
    setUrl(activeServer?.connectedUrl ?? null);
  }, [activeASpaceServerId, servers, setUrl]);

  useEffect(() => {
    if (activeASpaceServerId === null) {
      return;
    }

    const activeStillExists = servers.some((server) => server.id === activeASpaceServerId);
    if (!activeStillExists) {
      setActiveASpaceServerId(null);
    }
  }, [servers, activeASpaceServerId, setActiveASpaceServerId]);

  const layoutProps = {
    logoSrc: logoPlcm,
    settings,
    toggleSettings,
    jointManager,
    selectedRobot,
    reloadKey,
    onJointLimitsLoaded: setJointLimits,
    jointProperties,
    showCollisionMesh,
    setShowCollisionMesh,
    hoveredJointMesh,
    setHoveredJointMesh,
    pendingJoints,
    setPendingJoints,
    servers,
    robots,
    addServer,
    removeServer,
    addRobot,
    removeRobot,
    connectRobotToServer,
    disconnectRobot,
    onSelectURDF: handleRobotSelect,
    activeASpaceServerId,
    setActiveASpaceServerId,
  };

  const showDesktopLayout = !(isMobile && mobilePanelState !== 'none');
  const handlePendingJointsChange = (joints: number[] | null) => {
    setPendingJoints(joints ?? []);
  };

  return (
    <div className="w-full h-screen overflow-hidden">
      <MobilePanelControls
        className={`md:hidden flex items-center gap-2 mb-2 ${mobilePanelState !== 'none' ? 'hidden' : ''}`}
        mobilePanelState={mobilePanelState}
        setMobilePanelState={setMobilePanelState}
        showClose={false}
      />

      <WebSocketReceiver jointManager={jointManager} />

      {showDesktopLayout ? (
        <DesktopLayout {...layoutProps} />
      ) : (
        <MobileLayout
          {...layoutProps}
          mobilePanelState={mobilePanelState}
          setMobilePanelState={setMobilePanelState}
        />
      )}

      <MessageController
        pendingJoints={pendingJoints}
        setPendingJoints={handlePendingJointsChange}
        jointManager={jointManager}
      />
    </div>
  );
}

function App() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}

export default App;
