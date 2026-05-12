import { useState } from "react";
import { createPortal } from "react-dom";

import {
  ROBOT_MODEL_OPTIONS,
  type RobotModelConfig,
  type RobotOrigin,
} from "../model/robotModels";
import { useRobotControl } from "../context/RobotControlContext";

const DEFAULT_ORIGIN: RobotOrigin = {
  x: 0,
  y: 0,
  z: 0,
};

export default function CreateRobot() {
  const { createRobot } = useRobotControl();
  const [open, setOpen] = useState(false);
  const [robotName, setRobotName] = useState("");
  const [originInput, setOriginInput] = useState<Record<keyof RobotOrigin, string>>({
    x: String(DEFAULT_ORIGIN.x),
    y: String(DEFAULT_ORIGIN.y),
    z: String(DEFAULT_ORIGIN.z),
  });
  const [selectedModel, setSelectedModel] = useState<RobotModelConfig | null>(
    null,
  );

  function handleCreateRobot() {
    const trimmedName = robotName.trim();
    if (!trimmedName || !selectedModel) return;

    const origin: RobotOrigin = {
      x: Number.parseFloat(originInput.x) || 0,
      y: Number.parseFloat(originInput.y) || 0,
      z: Number.parseFloat(originInput.z) || 0,
    };

    createRobot(trimmedName, selectedModel, origin);
    setRobotName("");
    setOriginInput({
      x: String(DEFAULT_ORIGIN.x),
      y: String(DEFAULT_ORIGIN.y),
      z: String(DEFAULT_ORIGIN.z),
    });
    setSelectedModel(null);
    setOpen(false);
  }

  function updateOriginInput(axis: keyof RobotOrigin, value: string) {
    setOriginInput((current) => ({
      ...current,
      [axis]: value,
    }));
  }

  return (
    <div>
      <button onClick={() => setOpen(true)} className="button-ghost">
        +
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
            onClick={() => setOpen(false)}
          >
            <section
              className="panel z-50 w-[min(92vw,560px)] flex-col overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="panel-header">
                <div className="panel-title">Create Robot</div>
                <button onClick={() => setOpen(false)} className="button-ghost">
                  ✕
                </button>
              </div>
              <div className="panel-body flex flex-col gap-2">
                <input
                  value={robotName}
                  onChange={(event) => setRobotName(event.target.value)}
                  placeholder="Robot Name"
                  className="input-ghost w-full text-left"
                />
                <div className="grid grid-cols-3 gap-2 ml-1">
                  <label className="flex min-w-0 items-center gap-2">
                    <span className="text-xs text-[rgb(var(--fg-muted))]">
                      X:
                    </span>
                    <input
                      className="input-ghost min-w-0 w-full text-right"
                      type="number"
                      step="0.1"
                      value={originInput.x}
                      onChange={(event) =>
                        updateOriginInput("x", event.target.value)
                      }
                    />
                  </label>
                  <label className="flex min-w-0 items-center gap-2">
                    <span className="text-xs text-[rgb(var(--fg-muted))]">
                      Y:
                    </span>
                    <input
                      className="input-ghost min-w-0 w-full text-right"
                      type="number"
                      step="0.1"
                      value={originInput.y}
                      onChange={(event) =>
                        updateOriginInput("y", event.target.value)
                      }
                    />
                  </label>
                  <label className="flex min-w-0 items-center gap-2">
                    <span className="text-xs text-[rgb(var(--fg-muted))]">
                      Z:
                    </span>
                    <input
                      className="input-ghost min-w-0 w-full text-right"
                      type="number"
                      step="0.1"
                      value={originInput.z}
                      onChange={(event) =>
                        updateOriginInput("z", event.target.value)
                      }
                    />
                  </label>
                </div>
                <ul className="list-panel">
                  {ROBOT_MODEL_OPTIONS.map((model) => (
                    <li
                      key={model.id}
                      className={
                        selectedModel?.id === model.id
                          ? "text-[rgb(var(--brand))]"
                          : ""
                      }
                      onClick={() => {
                        setSelectedModel(model);
                        if (!robotName.trim()) {
                          setRobotName(model.label);
                        }
                      }}
                    >
                      {model.label}
                    </li>
                  ))}
                </ul>
                <button onClick={handleCreateRobot} className="button-ghost">
                  Create Robot
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
