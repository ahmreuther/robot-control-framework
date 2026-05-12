export type ServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ServerSessionInfo {
  serverUrl: string;
  status: ServerStatus;
  namespaceUris: string[];
  isRoboticsServer: boolean;
  motionDeviceIds: string[];
}
