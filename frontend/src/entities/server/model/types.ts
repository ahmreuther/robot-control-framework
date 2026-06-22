export type ServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ServerSessionInfo {
  serverUrl: string;
  status: ServerStatus;
  namespaceUris: string[];
  isRoboticsServer: boolean;
  motionDeviceIds: string[];
}

export interface NodeBinding {
  nodeId: string;
  displayName?: string | null;
  browseName?: string | null;
  nodeClass?: string | null;
}

export interface AddressSpaceNode extends NodeBinding {
  hasChildren: boolean;
}

export interface AddressSpaceReference {
  referenceType: string;
  nodeId: string;
  browseName?: string | null;
  typeDefinition?: string | null;
}

export interface MethodArgument {
  name?: string | null;
  dataTypeNodeId?: string | null;
  valueRank?: number | null;
  arrayDimensions: number[];
  description?: string | null;
}

export interface AddressSpaceNodeDetails {
  nodeId: string;
  browseName?: string | null;
  displayName?: string | null;
  nodeClass?: string | null;
  nodeClassValue?: number | null;
  description?: string | null;
  value?: unknown;
  dataType?: string | null;
  eventNotifier?: string | null;
  inputArguments: MethodArgument[];
  outputArguments: MethodArgument[];
}

export interface MotionDeviceBinding extends NodeBinding {
  typeDefinitionNodeId?: string | null;
  namespaceUri?: string | null;
}

export interface AxisBinding {
  axisName: string;
  axisNodeId: string;
  actualPositionNodeId?: string | null;
  engineeringUnitsNodeId?: string | null;
}

export interface MethodBinding extends NodeBinding {
  inputArguments: MethodArgument[];
  outputArguments: MethodArgument[];
}

export interface SkillBinding extends NodeBinding {
  parameterSetNodeId?: string | null;
  resultSetNodeId?: string | null;
  currentStateNodeId?: string | null;
  startNodeId?: string | null;
  haltNodeId?: string | null;
  resetNodeId?: string | null;
  suspendNodeId?: string | null;
  resumeNodeId?: string | null;
  parameters: Record<string, NodeBinding>;
  results: Record<string, NodeBinding>;
}
