import { useState } from 'react';
import { createPortal } from "react-dom";

export type ModelConfig = {
  id: string;
  label: string;
  url: string;
};

export interface URDFOptions {
  urdf: string;
  color: string;
  label: string;
}

interface URDFSelectorProps {
  addRobot: (name: string) => void;
  onSelect: (option: ModelConfig) => void;
}

const urdfOptions: ModelConfig[] = [
  { id: "fr3", label: "FR3", url: "/urdf/fr3_description/urdf/fr3.urdf" },
  { id: "fr3_wagon", label: "FR3 with Wagon", url: "/urdf/fr3_description_with_wagon/urdf/fr3.urdf" },
  { id: "ur5", label: "UR5", url: "/urdf/ur5_description/urdf/ur5_robot.urdf" },
  { id: "eva", label: "EVA", url: "/urdf/eva_description/urdf/eva_description.urdf" },
];

export function URDFSelector(props : URDFSelectorProps) {

  const [robotName, setRobotName] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);
  const [open, setOpen] = useState(false);

  function handleAddRobot() {
    if (!selectedModel) return;
    const name = robotName.trim() || selectedModel.label;
    props.addRobot(name);
    props.onSelect(selectedModel);
    setSelectedModel(selectedModel);
    setRobotName("");
    setSelectedModel(null);
  }

return(
  <div>
    <button
      onClick={() => setOpen(true)}
      className="button-ghost"
    >
      +
    </button>
    { open && createPortal(
      <div
          className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
    <section className="panel z-50 flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
    <div className="panel-header">
              <div className="panel-title">OPCUA Connect</div>
              <button
                onClick={() => setOpen(false)}
                className="button-ghost"
              >
                ✕
              </button>
            </div>
      <div className='panel-body'>
        
        <input
          value={robotName}
          onChange={(e) => setRobotName(e.target.value)}
          placeholder="Robot Name"
          className="input-ghost w-full text-left"
        />
      <div className="mt-2">
      </div>
    <ul className="list-panel mb-2">
      {urdfOptions.map(opt => (
        <li
          key={opt.url}
          className={selectedModel?.id === opt.id ? "text-[rgb(var(--brand))]" : ""}
          onClick={() => {setSelectedModel(opt)}}
        >
          {opt.label}
        </li>
      ))}
    </ul>
    <button onClick={handleAddRobot} className="button-ghost">Add Robot</button>
    </div>
  </section>
  </div>,
  document.body
    )}
  </div>
);}