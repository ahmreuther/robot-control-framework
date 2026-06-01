import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { MethodArgument } from "../../../entities/server/model/types";
import { useOpcuaServer } from "../context/OpcuaServerContext";

const typeMap: Record<number, string> = {
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

export interface RawMethodCallModalProps {
  open: boolean;
  serverUrl: string | null;
  nodeId: string | null;
  displayName?: string | null;
  inputArguments?: MethodArgument[];
  onClose: () => void;
}

export default function RawMethodCallModal({
  open,
  serverUrl,
  nodeId,
  displayName,
  inputArguments = [],
  onClose,
}: RawMethodCallModalProps) {
  const { callRawMethod } = useOpcuaServer();
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setInputValues({});
    setError(null);
  }, [open, nodeId, serverUrl]);

  if (!open) {
    return null;
  }

  function handleCall() {
    if (!serverUrl || !nodeId) {
      setError("No method node is selected.");
      return;
    }

    try {
      const args = inputArguments.map((argument, index) => {
        const key = getArgumentKey(argument, index);
        return (inputValues[key] ?? "").trim();
      });

      callRawMethod({
        serverUrl,
        nodeId,
        inputs: { args },
      });
      onClose();
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : "Failed to prepare method call.",
      );
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <section
        className="panel z-50 flex w-[min(92vw,640px)] flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <div className="panel-title">Input Parameters: {nodeId ?? ""}</div>
          <button onClick={onClose} className="button-ghost">
            ✕
          </button>
        </div>
        <div className="panel-body">
          <section className="panel mb-2 overflow-auto">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {inputArguments.map((argument, index) => {
                  const key = getArgumentKey(argument, index);
                  const typeLabel = getArgumentTypeLabel(argument);
                  const isArray = argument.valueRank === 1;
                  return (
                    <tr key={key}>
                      <td className="cell-muted">
                        {argument.name || `arg${index}`}
                      </td>
                      <td className="cell-mono">
                        <input
                          value={inputValues[key] ?? ""}
                          onChange={(event) => {
                            setInputValues((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }));
                            if (error) {
                              setError(null);
                            }
                          }}
                          placeholder={`${typeLabel}${isArray ? "[]" : ""}`}
                          className="input-ghost w-full text-left"
                        />
                      </td>
                    </tr>
                  );
                })}

                {inputArguments.length === 0 && (
                  <tr>
                    <td className="cell-muted" colSpan={3}>
                      This method exposes no input arguments.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {error && <div className="mb-2 text-xs text-rose-300">{error}</div>}

          <button onClick={handleCall} className="button-ghost w-full">
            Call Method
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function getArgumentKey(argument: MethodArgument, index: number): string {
  return argument.name || `arg${index}`;
}

function getArgumentTypeLabel(argument: MethodArgument): string {
  const nodeId = argument.dataTypeNodeId;
  if (!nodeId) {
    return "Unknown";
  }
  const numericMatch = /^i=(\d+)$/.exec(nodeId);
  if (numericMatch) {
    const typeId = Number(numericMatch[1]);
    return typeMap[typeId] || `TypeId:${typeId}`;
  }
  return nodeId;
}
