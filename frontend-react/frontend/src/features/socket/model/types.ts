import type { JointStateManager } from '../../robot-control/hooks/useJointState';

export interface AnglesPayload {
  angles?: Record<string, number>;
  unit?: string;
}

export interface RobotInfoPayload {
  model?: string;
  gotoMethodNodeId?: string;
  [key: string]: unknown;
}

export type KnownPrefixedKind =
  | 'custom'
  | 'unsubscribe'
  | 'event'
  | 'robotinfo'
  | 'Mode'
  | 'angles'
  | 'unknown';

export interface PrefixedMessage {
  kind: 'prefixed';
  prefix: KnownPrefixedKind;
  rawPrefix: string;
  payloadRaw: string;
}

export interface PlainMessage {
  kind: 'plain';
  message: string;
}

export type ParsedIncomingMessage = PrefixedMessage | PlainMessage;

export interface WebSocketHandlerContext {
  targetServerId: number | null;
  isSyncActive: boolean;
  orderedJointNames: string[];
  opcuaJointLength: number | null;
  lastAxleUiUpdateAt: number;
  jointManager: JointStateManager;
  appendLog: (line: string, serverId?: number | null) => void;
  updateTargetState: (patch: {
    robotName?: string;
    robotStatus?: string;
    robotMode?: string;
    axleValues?: Record<string, number> | null;
    robotInfo?: Record<string, unknown> | null;
    gotoMethodNodeId?: string | null;
    opcuaJointLength?: number;
  }) => void;
  resetTargetState: () => void;
  updateServerConnectionStatus: (serverId: number, isConnected: boolean) => void;
  setActiveRuntimeServerId: (id: number | null) => void;
}

export interface WebSocketHandlerResult {
  nextLastAxleUiUpdateAt: number;
}
