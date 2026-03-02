import { useState } from 'react';

import type { SettingsState } from '../App';
import { useSolverConfig } from '../contexts/useSolverConfigContext';
import { CheckBox } from './CheckBox';

interface SettingsProps {
  settings: SettingsState;
  toggleSettings: (key: keyof SettingsState) => void;
}

export default function Settings(props: SettingsProps) {
  const [open, setOpen] = useState(false);
  const { config: solverConfig, updateConfig, resetConfig } = useSolverConfig();

  return (
    <div>
      <button onClick={() => setOpen(true)} className="button-ghost">
        Settings
      </button>

      {open && <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />}

      {open && (
        <div className="panel fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col w-96 max-h-[80vh] overflow-hidden">
          <div className="panel-header">
            <div className="panel-title">Settings</div>
            <button onClick={() => setOpen(false)} className="button-ghost">
              ✕
            </button>
          </div>

          <div className="panel-body space-y-4 overflow-y-auto flex-1">
            <div className="mb-4">
              <div className="panel-title ml-2">Scene</div>
              <CheckBox
                label="Effect Composer"
                value={props.settings.effectComposer}
                onToggle={() => props.toggleSettings('effectComposer')}
              />
              <CheckBox
                label="Environment"
                value={props.settings.environment}
                onToggle={() => props.toggleSettings('environment')}
              />
            </div>

            <div className="mb-4">
              <div className="panel-title ml-2 mb-2">Solver</div>
              <CheckBox
                label="Use SVD"
                value={solverConfig.useSVD}
                onToggle={() => updateConfig({ useSVD: !solverConfig.useSVD })}
              />
              <div className="ml-2 space-y-1">
                <div className="flex items-center justify-between">
                  <label>Max Iterations</label>
                  <input
                    type="number"
                    value={solverConfig.maxIterations}
                    onChange={(e) => updateConfig({ maxIterations: parseInt(e.target.value) })}
                    className="input-ghost w-20"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label>Stall Threshold</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={solverConfig.stallThreshold}
                    onChange={(e) => updateConfig({ stallThreshold: parseFloat(e.target.value) })}
                    className="input-ghost w-24"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label>Damping Factor</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={solverConfig.dampingFactor}
                    onChange={(e) => updateConfig({ dampingFactor: parseFloat(e.target.value) })}
                    className="input-ghost w-24"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label>Diverge Threshold</label>
                  <input
                    type="number"
                    step="0.001"
                    value={solverConfig.divergeThreshold}
                    onChange={(e) => updateConfig({ divergeThreshold: parseFloat(e.target.value) })}
                    className="input-ghost w-24"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label>Rest Pose Factor</label>
                  <input
                    type="number"
                    step="0.001"
                    value={solverConfig.restPoseFactor}
                    onChange={(e) => updateConfig({ restPoseFactor: parseFloat(e.target.value) })}
                    className="input-ghost w-24"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label>Translation Converge Threshold</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={solverConfig.translationConvergeThreshold}
                    onChange={(e) =>
                      updateConfig({ translationConvergeThreshold: parseFloat(e.target.value) })
                    }
                    className="input-ghost w-24"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label>Rotation Converge Threshold</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={solverConfig.rotationConvergeThreshold}
                    onChange={(e) =>
                      updateConfig({ rotationConvergeThreshold: parseFloat(e.target.value) })
                    }
                    className="input-ghost w-24"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label>Translation Factor</label>
                  <input
                    type="number"
                    step="0.1"
                    value={solverConfig.translationFactor}
                    onChange={(e) =>
                      updateConfig({ translationFactor: parseFloat(e.target.value) })
                    }
                    className="input-ghost w-24"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label>Rotation Factor</label>
                  <input
                    type="number"
                    step="0.1"
                    value={solverConfig.rotationFactor}
                    onChange={(e) => updateConfig({ rotationFactor: parseFloat(e.target.value) })}
                    className="input-ghost w-24"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label>Translation Step</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={solverConfig.translationStep}
                    onChange={(e) => updateConfig({ translationStep: parseFloat(e.target.value) })}
                    className="input-ghost w-24"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label>Rotation Step</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={solverConfig.rotationStep}
                    onChange={(e) => updateConfig({ rotationStep: parseFloat(e.target.value) })}
                    className="input-ghost w-24"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label>Translation Error Clamp</label>
                  <input
                    type="number"
                    step="0.01"
                    value={solverConfig.translationErrorClamp}
                    onChange={(e) =>
                      updateConfig({ translationErrorClamp: parseFloat(e.target.value) })
                    }
                    className="input-ghost w-24"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label>Rotation Error Clamp</label>
                  <input
                    type="number"
                    step="0.01"
                    value={solverConfig.rotationErrorClamp}
                    onChange={(e) =>
                      updateConfig({ rotationErrorClamp: parseFloat(e.target.value) })
                    }
                    className="input-ghost w-24"
                  />
                </div>
              </div>

              <button onClick={resetConfig} className="button-ghost mt-2 w-full">
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
