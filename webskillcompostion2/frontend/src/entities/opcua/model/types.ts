export interface NodeBinding {
  nodeId: string;
  displayName?: string | null;
  browseName?: string | null;
  nodeClass?: string | null;
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

export interface MethodArgument {
  name?: string | null;
  dataTypeNodeId?: string | null;
  valueRank?: number | null;
  arrayDimensions: number[];
  description?: string | null;
}

export interface MethodBinding extends NodeBinding {
  inputArguments: MethodArgument[];
  outputArguments: MethodArgument[];
}
