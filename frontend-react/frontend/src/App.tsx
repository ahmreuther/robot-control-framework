import { useCallback, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { URDFRobot } from 'urdf-loader/src/URDFClasses';

import { useAppShellState } from './app/hooks/useAppShellState';
import { AppProviders } from './app/AppProviders';
import { DesktopLayout } from './app/layout/DesktopLayout';
import { MobileLayout } from './app/layout/MobileLayout';
import logoPlcm from './assets/Logo_PLCM_RGB_mit Text.svg';
import MessageController from './features/robot-control/components/MessageController';
import { useJointState } from './features/robot-control/hooks/useJointState';
import { useSceneState } from './features/robot-control/hooks/useSceneState';
import {
  generateWorkspacePointCloud,
  type WorkspaceProgress,
  type WorkspaceResolution,
} from './features/robot-control/model/workspaceGeneration';
import { useServersContext } from './features/server-management/contexts/ServersContext';
import { useUrlContext } from './features/server-management/contexts/UrlContext';
import WebSocketReceiver from './features/socket/components/WebSocketReceiver';
import MobilePanelControls from './app/layout/MobilePanelControls';

function AppShell() {
  const jointManager = useJointState();
  const robotRef = useRef<URDFRobot | null>(null);
  const workspaceAbortRef = useRef<AbortController | null>(null);
  const [workspaceResolution, setWorkspaceResolution] = useState<WorkspaceResolution>('medium');
  const [workspacePoints, setWorkspacePoints] = useState<THREE.Vector3[]>([]);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [isGeneratingWorkspace, setIsGeneratingWorkspace] = useState(false);
  const [workspaceProgress, setWorkspaceProgress] = useState<WorkspaceProgress | null>(null);
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

  const handleRobotReady = useCallback((robot: URDFRobot | null) => {
    robotRef.current = robot;
    setWorkspacePoints([]);
    setShowWorkspace(false);
    setWorkspaceProgress(null);
    workspaceAbortRef.current?.abort();
    workspaceAbortRef.current = null;
    setIsGeneratingWorkspace(false);
  }, []);

  const handleGenerateWorkspace = useCallback(async () => {
    if (!robotRef.current || isGeneratingWorkspace) return;

    const abortController = new AbortController();
    workspaceAbortRef.current = abortController;
    setIsGeneratingWorkspace(true);
    setShowWorkspace(true);
    setWorkspaceProgress({ percent: 0, label: 'Starting workspace generation' });

    try {
      const points = await generateWorkspacePointCloud({
        robot: robotRef.current,
        resolution: workspaceResolution,
        signal: abortController.signal,
        onProgress: setWorkspaceProgress,
      });
      if (!abortController.signal.aborted) {
        setWorkspacePoints(points);
        setShowWorkspace(true);
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Workspace generation failed:', error);
        setWorkspaceProgress({
          percent: 0,
          label: error instanceof Error ? error.message : 'Workspace generation failed',
        });
      } else {
        setWorkspaceProgress(null);
      }
    } finally {
      if (workspaceAbortRef.current === abortController) {
        workspaceAbortRef.current = null;
      }
      setIsGeneratingWorkspace(false);
    }
  }, [isGeneratingWorkspace, workspaceResolution]);

  const handleCancelWorkspace = useCallback(() => {
    workspaceAbortRef.current?.abort();
    workspaceAbortRef.current = null;
    setIsGeneratingWorkspace(false);
    setWorkspaceProgress(null);
  }, []);

  const handlePendingJointsChange = useCallback(
    (joints: number[] | null) => {
      setPendingJoints(joints ?? []);
    },
    [setPendingJoints],
  );

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
    setPendingJoints: handlePendingJointsChange,
    workspaceResolution,
    setWorkspaceResolution,
    workspacePoints,
    showWorkspace,
    setShowWorkspace,
    isGeneratingWorkspace,
    workspaceProgress,
    onGenerateWorkspace: handleGenerateWorkspace,
    onCancelWorkspace: handleCancelWorkspace,
    onRobotReady: handleRobotReady,
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
