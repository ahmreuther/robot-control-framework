import { useEffect, useState } from "react";

import { DisclosureSection } from "../../../shared/ui/DisclosureSection";
import { Toggle } from "../../../shared/ui/Toggle";
import { useRobotControl } from "../../robot-control/context/RobotControlContext";
import { useSolverConfig } from "../context/SolverConfigContext";
import type { ViewportSceneState } from "../model/sceneState";
import type { SolverConfig } from "../model/solverConfig";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
}

type ToggleableViewportSettingKey =
  | "effectComposer"
  | "environment"
  | "grid"
  | "stats";

interface ViewportHeaderControlsProps {
  sceneState: ViewportSceneState;
}

export default function ViewportHeaderControls({
  sceneState,
}: ViewportHeaderControlsProps) {
  const { activeRobot, updateRobotPanelState } = useRobotControl();
  const { config: solverConfig, updateConfig, resetConfig } = useSolverConfig();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalSectionOpen, setGoalSectionOpen] = useState(true);
  const [viewportSectionOpen, setViewportSectionOpen] = useState(true);
  const [solverSectionOpen, setSolverSectionOpen] = useState(false);

  const solverNumberFields: Array<{
    key: Exclude<keyof SolverConfig, "useSVD">;
    label: string;
    step?: number;
  }> = [
    { key: "maxIterations", label: "Max Iterations", step: 1 },
    { key: "stallThreshold", label: "Stall Threshold", step: 0.0001 },
    { key: "dampingFactor", label: "Damping Factor", step: 0.0001 },
    { key: "divergeThreshold", label: "Diverge Threshold", step: 0.001 },
    { key: "restPoseFactor", label: "Rest Pose Factor", step: 0.001 },
    {
      key: "translationConvergeThreshold",
      label: "Move Converge",
      step: 0.0001,
    },
    {
      key: "rotationConvergeThreshold",
      label: "Rotate Converge",
      step: 0.00001,
    },
    { key: "translationFactor", label: "Move Factor", step: 0.1 },
    { key: "rotationFactor", label: "Rotate Factor", step: 0.1 },
    { key: "translationStep", label: "Move Step", step: 0.0001 },
    { key: "rotationStep", label: "Rotate Step", step: 0.0001 },
    { key: "translationErrorClamp", label: "Move Clamp", step: 0.01 },
    { key: "rotationErrorClamp", label: "Rotate Clamp", step: 0.01 },
  ];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!activeRobot || isTypingTarget(event.target)) {
        return;
      }

      if (event.key === "h" || event.key === "H") {
        event.preventDefault();
        updateRobotPanelState(activeRobot.robotId, {
          goalMarkerEnabled: !activeRobot.panel.goalMarkerEnabled,
        });
        return;
      }

      if (event.key === "q" || event.key === "Q") {
        event.preventDefault();
        updateRobotPanelState(activeRobot.robotId, {
          goalMarkerSpace:
            activeRobot.panel.goalMarkerSpace === "world" ? "local" : "world",
        });
        return;
      }

      if (event.key === "w" || event.key === "W") {
        event.preventDefault();
        updateRobotPanelState(activeRobot.robotId, {
          goalMarkerConstraintMode:
            activeRobot.panel.goalMarkerConstraintMode === "pose"
              ? "position"
              : "pose",
        });
        return;
      }

      if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        updateRobotPanelState(activeRobot.robotId, {
          goalMarkerMode:
            activeRobot.panel.goalMarkerMode === "translate"
              ? "rotate"
              : "translate",
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeRobot, updateRobotPanelState]);

  const viewportEntries: Array<{
    key: ToggleableViewportSettingKey;
    label: string;
  }> = [
    { key: "effectComposer", label: "Effect Composer" },
    { key: "environment", label: "Environment" },
    { key: "grid", label: "Grid" },
    { key: "stats", label: "FPS" },
  ];

  const goalDisabled = !activeRobot;
  const goalHidden = activeRobot ? !activeRobot.panel.goalMarkerEnabled : true;
  const goalFullPose =
    (activeRobot?.panel.goalMarkerConstraintMode ?? "pose") === "pose";
  const goalRotate = activeRobot?.panel.goalMarkerMode === "rotate";
  const goalLocal = activeRobot?.panel.goalMarkerSpace === "local";
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          className="button-ghost"
          onClick={() => setSettingsOpen((current) => !current)}
          type="button"
        >
          Settings
        </button>
      </div>
      {settingsOpen && (
        <div className="absolute right-0 top-10 z-20">
          <div className="panel w-80 max-h-[min(42rem,calc(100vh-8rem))] overflow-hidden">
            <div className="panel-body flex max-h-[min(42rem,calc(100vh-8rem))] flex-col gap-2 overflow-y-auto">
              <DisclosureSection
                title="Goal Marker"
                open={goalSectionOpen}
                onToggle={() => setGoalSectionOpen((current) => !current)}
              >
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>Hide</span>
                  <Toggle
                    disabled={goalDisabled}
                    checked={goalHidden}
                    onChange={(checked) => {
                      if (!activeRobot) return;
                      updateRobotPanelState(activeRobot.robotId, {
                        goalMarkerEnabled: !checked,
                      });
                    }}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>Orientation Mode</span>
                  <Toggle
                    disabled={goalDisabled}
                    checked={goalRotate}
                    onChange={(checked) => {
                      if (!activeRobot) return;
                      updateRobotPanelState(activeRobot.robotId, {
                        goalMarkerMode: checked ? "rotate" : "translate",
                      });
                    }}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>Keep Orientation</span>
                  <Toggle
                    disabled={goalDisabled}
                    checked={goalFullPose}
                    onChange={(checked) => {
                      if (!activeRobot) return;
                      updateRobotPanelState(activeRobot.robotId, {
                        goalMarkerConstraintMode: checked ? "pose" : "position",
                      });
                    }}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>Local Coordinates</span>
                  <Toggle
                    disabled={goalDisabled}
                    checked={goalLocal}
                    onChange={(checked) => {
                      if (!activeRobot) return;
                      updateRobotPanelState(activeRobot.robotId, {
                        goalMarkerSpace: checked ? "local" : "world",
                      });
                    }}
                  />
                </label>
              </DisclosureSection>

              <DisclosureSection
                title="Viewport"
                open={viewportSectionOpen}
                onToggle={() => setViewportSectionOpen((current) => !current)}
              >
                {viewportEntries.map((entry) => (
                  <label
                    key={entry.key}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span>{entry.label}</span>
                    <Toggle
                      checked={sceneState.settings[entry.key]}
                      onChange={() => sceneState.toggleSetting(entry.key)}
                    />
                  </label>
                ))}
              </DisclosureSection>

              <DisclosureSection
                title="Solver"
                open={solverSectionOpen}
                onToggle={() => setSolverSectionOpen((current) => !current)}
              >
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>Use SVD</span>
                  <Toggle
                    checked={solverConfig.useSVD}
                    onChange={(checked) => updateConfig({ useSVD: checked })}
                  />
                </label>
                {solverNumberFields.map((field) => (
                  <label
                    key={field.key}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span>{field.label}</span>
                    <input
                      className="input-ghost w-24 text-right"
                      type="number"
                      step={field.step}
                      value={solverConfig[field.key]}
                      onChange={(event) => {
                        const rawValue = event.target.value;
                        const nextValue =
                          field.key === "maxIterations"
                            ? Number.parseInt(rawValue, 10)
                            : Number.parseFloat(rawValue);
                        if (!Number.isFinite(nextValue)) {
                          return;
                        }
                        updateConfig({
                          [field.key]: nextValue,
                        } as Partial<SolverConfig>);
                      }}
                    />
                  </label>
                ))}
                <button
                  className="button-ghost mt-2"
                  onClick={resetConfig}
                  type="button"
                >
                  Reset Solver
                </button>
              </DisclosureSection>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
