export type UaNode = {
  nodeId: string;
  displayName: string;
  browseName?: string;
  nodeClass: string; // "Object", "Variable", "Method"
  children?: UaNode[];
  loaded?: boolean;
  expanded?: boolean;
  loading?: boolean;
};

export type SelectedNodeInfo = {
  nodeId: string;
  attributes: Record<string, string>;
};

// hardcoded typemapping from library : asyncua.ua.uatypes
export const typeMap: Record<number, string> = {
  0: "Null",
  1: "Boolean",
  2: "SByte",
  3: "Byte",
  4: "Int16",
  5: "UInt16",
  6: "Int32",
  7: "UInt32",
  8: "Int64",
  9: "UInt64",
  10: "Float",
  11: "Double",
  12: "String",
  13: "DateTime",
  14: "Guid",
  15: "ByteString",
  16: "XmlElement",
  17: "NodeId",
  18: "ExpandedNodeId",
  19: "StatusCode",
  20: "QualifiedName",
  21: "LocalizedText",
  22: "ExtensionObject",
  23: "DataValue",
  24: "Variant",
  25: "DiagnosticInfo",
};

export const REST_BACKEND_BASE = "http://127.0.0.1:8001";
