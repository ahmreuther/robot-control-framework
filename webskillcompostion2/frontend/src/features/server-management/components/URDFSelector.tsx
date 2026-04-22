import { useState } from 'react';
import { createPortal } from 'react-dom';

export interface ModelConfig {
  id: string;
  label: string;
  url: string;
}

export interface URDFSelectorProps {
  disabled?: boolean;
  onSelect: (model: ModelConfig, name: string) => void;
}

const urdfOptions: ModelConfig[] = [
  { id: 'fr3', label: 'FR3', url: '/urdf/fr3_description/urdf/fr3.urdf' },
  {
    id: 'fr3_wagon',
    label: 'FR3 with Wagon',
    url: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf',
  },
  { id: 'ur5', label: 'UR5', url: '/urdf/ur5_description/urdf/ur5_robot.urdf' },
  { id: 'eva', label: 'EVA', url: '/urdf/eva_description/urdf/eva_description.urdf' },
];

export function URDFSelector({ disabled = false, onSelect }: URDFSelectorProps) {
  const [robotName, setRobotName] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);
  const [open, setOpen] = useState(false);

  function handleAddRobot() {
    if (!selectedModel) return;
    onSelect(selectedModel, robotName.trim() || selectedModel.label);
    setRobotName('');
    setSelectedModel(null);
    setOpen(false);
  }

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="button-ghost"
        disabled={disabled}
        title={disabled ? 'Select a robot first' : undefined}
      >
        +
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center"
            onClick={() => setOpen(false)}
          >
            <section
              className="panel z-50 w-[min(92vw,560px)] flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel-header">
                <div className="panel-title">URDF Select</div>
                <button onClick={() => setOpen(false)} className="button-ghost">
                  ✕
                </button>
              </div>
              <div className="panel-body connect-panel-body">
                <input
                  value={robotName}
                  onChange={(e) => setRobotName(e.target.value)}
                  placeholder="Robot Name"
                  className="input-ghost w-full text-left"
                />
                <ul className="list-panel mb-2">
                  {urdfOptions.map((opt) => (
                    <li
                      key={opt.url}
                      className={selectedModel?.id === opt.id ? 'text-[rgb(var(--brand))]' : ''}
                      onClick={() => {
                        setSelectedModel(opt);
                      }}
                    >
                      {opt.label}
                    </li>
                  ))}
                </ul>
                <button onClick={handleAddRobot} className="button-ghost">
                  Add Robot
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
