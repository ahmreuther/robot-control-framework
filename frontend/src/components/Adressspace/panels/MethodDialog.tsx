import { UaNode, typeMap } from "../types";

type InputArgTuple = [name: string, type: number, valueRank?: number];
type MethodDialogProps = {
  isOpen: boolean;
  node: UaNode | null;
  inputs: InputArgTuple[];
  inputValues: Record<string, string>;
  result: string | null;
  isLoading: boolean;
  onInputChange: (name: string, value: string) => void;
  onCall: () => void;
  onClose: () => void;
};

export const MethodDialog = ({isOpen, node, inputs, inputValues, result, isLoading, onInputChange, onCall, onClose} : MethodDialogProps ) =>{
  if (!isOpen) return null;

  return (
      <>
        <header className="panel-header">
          <div className="panel-title">Input Parameters</div>
          <button onClick={onClose} className="button-ghost">✕</button>
        </header>
        <div className="panel-body">
        {inputs.map(([name, type, valueRank]) => {
          const typeStr = typeMap[type] || `TypeId:${type}`;
          const arrayStr = valueRank === 1 ? "[]" : "";
          return (
            <div key={name}>
              <span className="code">{name}</span>
              <input
                value={inputValues[name] ?? ""}
                onChange={e => onInputChange(name, e.target.value)}
                placeholder={`${typeStr}${arrayStr}`}
                className="input-ghost w-full text-left mb-2"
              />
            </div>
          );
        })}
        <button onClick={onCall} disabled={isLoading} className="button-ghost">{isLoading ? "Calling..." : "Call Method"}</button>
      </div>
    </>
  );
};
