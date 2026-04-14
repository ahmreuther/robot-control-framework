import type { ModelConfig } from '../../features/server-management/components/URDFSelector';
import type { Robot, Server } from '../../features/server-management/hooks/useServersAndRobots';
import type { JointProperty } from '../../features/robot-control/hooks/useSceneState';
import type { JointStateManager } from '../../features/robot-control/hooks/useJointState';
import type { MobilePanelState, SettingsState } from '../hooks/useAppShellState';

export interface WorkspaceLayoutProps {
  logoSrc: string;
  settings: SettingsState;
  toggleSettings: (key: keyof SettingsState) => void;
  jointManager: JointStateManager;
  selectedRobot: ModelConfig | null;
  reloadKey: number;
  onJointLimitsLoaded: (limits: (JointProperty | null)[]) => void;
  jointProperties: (JointProperty | null)[];
  showCollisionMesh: boolean;
  setShowCollisionMesh: (visible: boolean) => void;
  hoveredJointMesh: number | null;
  setHoveredJointMesh: (index: number | null) => void;
  pendingJoints: number[];
  setPendingJoints: (joints: number[]) => void;
  servers: Server[];
  robots: Robot[];
  addServer: (name: string, connectedUrl: string, backendport: string | null) => number;
  removeServer: (id: number) => void;
  addRobot: (name: string) => number;
  removeRobot: (id: number) => void;
  connectRobotToServer: (robotId: number, serverId: number) => void;
  disconnectRobot: (robotId: number) => void;
  onSelectURDF: (model: ModelConfig) => void;
  activeASpaceServerId: number | null;
  setActiveASpaceServerId: (id: number | null) => void;
}

export interface MobileControlsProps {
  mobilePanelState: MobilePanelState;
  setMobilePanelState: (state: MobilePanelState) => void;
}
