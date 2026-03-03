import type { ModelConfig } from '../../components/AddServerAndRobots/URDFSelector';
import type { JointStateManager } from '../../hooks/useJointState';
import type { JointProperty } from '../../hooks/useSceneState';
import type { Robot, Server } from '../../hooks/useServersAndRobots';
import type { MobilePanelState,SettingsState } from '../hooks/useAppShellState';

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
