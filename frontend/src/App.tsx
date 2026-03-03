import { useEffect } from 'react';

import { useAppShellState } from './app/hooks/useAppShellState';
import { DesktopLayout, MobileLayout } from './app/layout';
import { AppProviders, useServersContext, useUrlContext } from './app/providers';
import logoPlcm from './assets/Logo_PLCM_RGB_mit Text.svg';
import { MessageController, useJointState, useSceneState } from './features/robot-control';
import { WebSocketReceiver } from './features/socket';
import { MobilePanelControls } from './shared/ui';

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
  } = useServersContext();

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
