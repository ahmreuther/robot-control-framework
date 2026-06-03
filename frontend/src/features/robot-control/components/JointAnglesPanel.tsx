import { useEffect, useMemo, useRef, useState } from "react";

import { DisclosureSection } from "../../../shared/ui/DisclosureSection";
import { Toggle } from "../../../shared/ui/Toggle";
import { useRobotControl } from "../context/RobotControlContext";
import { useRobotInteraction } from "../context/RobotInteractionContext";
import {
  JOINT_SOURCE_ID,
  type JointProperty,
  type JointStateSnapshot,
} from "../model/jointStateManager";

const DEGREE_FACTOR = 180 / Math.PI;
const RADIAN_FACTOR = Math.PI / 180;
const MIN_WORKSPACE_SAMPLE_COUNT = 1000;
const MAX_WORKSPACE_SAMPLE_COUNT = 8_000_000;

function toDisplayValue(
  value: number,
  property: JointProperty | null,
  useDegrees: boolean,
): number {
  if (property?.jointType === "prismatic") {
    return value * 1000;
  }
  return useDegrees ? value * DEGREE_FACTOR : value;
}

function toManagerValue(
  value: number,
  property: JointProperty | null,
  useDegrees: boolean,
): number {
  if (property?.jointType === "prismatic") {
    return value / 1000;
  }
  return useDegrees ? value * RADIAN_FACTOR : value;
}

function formatValue(
  value: number,
  property: JointProperty | null,
  useDegrees: boolean,
): string {
  const displayValue = toDisplayValue(value, property, useDegrees);
  if (property?.jointType === "prismatic") {
    return displayValue.toFixed(2);
  }
  return displayValue.toFixed(useDegrees ? 1 : 3);
}

function getSliderConfig(
  property: JointProperty | null,
  useDegrees: boolean,
): { min: number; max: number; step: number; unit: string } {
  if (property?.jointType === "prismatic") {
    const min = property.min * 1000;
    const max = property.max * 1000;
    const range = max - min;
    return {
      min,
      max,
      step: Math.max(range / 100, 0.01),
      unit: "mm",
    };
  }

  const minRad = property?.min ?? -Math.PI;
  const maxRad = property?.max ?? Math.PI;
  if (useDegrees) {
    const min = minRad * DEGREE_FACTOR;
    const max = maxRad * DEGREE_FACTOR;
    return {
      min,
      max,
      step: Math.max((max - min) / 100, 0.1),
      unit: "°",
    };
  }

  return {
    min: minRad,
    max: maxRad,
    step: Math.max((maxRad - minRad) / 100, 0.001),
    unit: "rad",
  };
}

const EMPTY_MANAGER_STATE: JointStateSnapshot = {
  angles: [],
  activeSourceId: null,
  jointNames: [],
  jointPropertiesByName: {},
};

type OriginPoseInput = {
  x: string;
  y: string;
  z: string;
  roll: string;
  pitch: string;
  yaw: string;
};

function formatOriginPositionValue(value: number): string {
  return value.toFixed(3);
}

function formatOriginRotationValue(value: number, useDegrees: boolean): string {
  const displayValue = useDegrees ? value * DEGREE_FACTOR : value;
  return displayValue.toFixed(useDegrees ? 1 : 3);
}

function toOriginPoseInput(
  origin: {
    x: number;
    y: number;
    z: number;
    roll: number;
    pitch: number;
    yaw: number;
  },
  useDegrees: boolean,
): OriginPoseInput {
  return {
    x: formatOriginPositionValue(origin.x),
    y: formatOriginPositionValue(origin.y),
    z: formatOriginPositionValue(origin.z),
    roll: formatOriginRotationValue(origin.roll, useDegrees),
    pitch: formatOriginRotationValue(origin.pitch, useDegrees),
    yaw: formatOriginRotationValue(origin.yaw, useDegrees),
  };
}

export default function JointAnglesPanel() {
  const {
    activeRobot,
    getActiveJointManager,
    isSyncing,
    updateRobotJointAngles,
    updateRobotVisualBinding,
    updateRobotPanelState,
  } = useRobotControl();
  const {
    beginManipulation,
    endManipulation,
    getHighlightedJointName,
    manipulation,
    setHighlightedJointName,
  } = useRobotInteraction();
  const manager = getActiveJointManager();
  const [managerState, setManagerState] =
    useState<JointStateSnapshot>(EMPTY_MANAGER_STATE);
  const [isSliderAbortHovered, setIsSliderAbortHovered] = useState(false);
  const [workspaceSampleInput, setWorkspaceSampleInput] = useState("");
  const [workspaceOptionsOpen, setWorkspaceOptionsOpen] = useState(false);
  const [originPoseOpen, setOriginPoseOpen] = useState(false);
  const [originPoseInput, setOriginPoseInput] = useState<OriginPoseInput>({
    x: "0",
    y: "0",
    z: "0",
    roll: "0",
    pitch: "0",
    yaw: "0",
  });
  const sliderAbortRef = useRef<HTMLDivElement | null>(null);
  const sliderPointerActiveRef = useRef(false);
  const sliderAbortHoveredRef = useRef(false);

  useEffect(() => {
    if (!manager) {
      setManagerState(EMPTY_MANAGER_STATE);
      return;
    }

    setManagerState(manager.getState());
    return manager.subscribe((snapshot) => {
      setManagerState(snapshot);
    });
  }, [manager]);

  useEffect(() => {
    if (!activeRobot) {
      setWorkspaceSampleInput("");
      setWorkspaceOptionsOpen(false);
      return;
    }
    setWorkspaceSampleInput(String(activeRobot.panel.workspaceSampleCount));
    setOriginPoseInput(
      toOriginPoseInput(
        activeRobot.visual.origin,
        activeRobot.panel.useDegrees,
      ),
    );
  }, [activeRobot]);

  useEffect(() => {
    const isSyncSliderManipulation =
      manipulation?.syncMode &&
      manipulation.sourceId === JOINT_SOURCE_ID.MANUAL;
    if (!isSyncSliderManipulation) {
      sliderAbortHoveredRef.current = false;
      setIsSliderAbortHovered(false);
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const abortArea = sliderAbortRef.current;
      if (!abortArea) {
        sliderAbortHoveredRef.current = false;
        setIsSliderAbortHovered(false);
        return;
      }

      const rect = abortArea.getBoundingClientRect();
      const hovered =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      sliderAbortHoveredRef.current = hovered;
      setIsSliderAbortHovered(hovered);
    }

    window.addEventListener("pointermove", handlePointerMove, true);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      sliderAbortHoveredRef.current = false;
      setIsSliderAbortHovered(false);
    };
  }, [manipulation?.sourceId, manipulation?.syncMode]);

  useEffect(() => {
    if (managerState.activeSourceId !== JOINT_SOURCE_ID.MANUAL) {
      sliderPointerActiveRef.current = false;
      return;
    }

    function handleWindowPointerUp(event: PointerEvent) {
      if (!sliderPointerActiveRef.current) {
        return;
      }
      const abortArea = sliderAbortRef.current;
      if (abortArea) {
        const rect = abortArea.getBoundingClientRect();
        sliderAbortHoveredRef.current =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        setIsSliderAbortHovered(sliderAbortHoveredRef.current);
      }
      sliderPointerActiveRef.current = false;
      endSliderManipulation(false);
    }

    function handleWindowPointerCancel() {
      if (!sliderPointerActiveRef.current) {
        return;
      }
      sliderPointerActiveRef.current = false;
      endSliderManipulation(true);
    }

    window.addEventListener("pointerup", handleWindowPointerUp, true);
    window.addEventListener("pointercancel", handleWindowPointerCancel, true);
    return () => {
      window.removeEventListener("pointerup", handleWindowPointerUp, true);
      window.removeEventListener(
        "pointercancel",
        handleWindowPointerCancel,
        true,
      );
      sliderPointerActiveRef.current = false;
    };
  }, [managerState.activeSourceId]);

  const rows = useMemo(
    () =>
      managerState.jointNames
        .map((jointName, index) => ({
          jointName,
          index,
          angle: managerState.angles[index] ?? 0,
          property: managerState.jointPropertiesByName[jointName] ?? null,
        }))
        .filter((row) => row.property?.jointType !== "fixed"),
    [
      managerState.angles,
      managerState.jointNames,
      managerState.jointPropertiesByName,
    ],
  );

  if (!activeRobot) {
    return <div></div>;
  }

  if (!manager) {
    return <div></div>;
  }

  const currentRobot = activeRobot;

  function updateWorkspaceSampleCount(value: number) {
    if (!Number.isFinite(value)) {
      return;
    }
    const nextValue = Math.max(
      MIN_WORKSPACE_SAMPLE_COUNT,
      Math.min(MAX_WORKSPACE_SAMPLE_COUNT, Math.round(value)),
    );
    setWorkspaceSampleInput(String(nextValue));
    updateRobotPanelState(robotId, {
      workspaceSampleCount: nextValue,
    });
  }

  function showOrGenerateWorkspace(nextSampleCount?: number) {
    updateRobotPanelState(robotId, {
      showWorkspace: true,
    });
  }

  function generateWorkspace(nextSampleCount?: number) {
    const sampleCount =
      nextSampleCount ?? currentRobot.panel.workspaceSampleCount;
    setWorkspaceOptionsOpen(true);
    updateRobotPanelState(robotId, {
      showWorkspace: true,
      workspaceSampleCount: sampleCount,
      workspaceGenerationVersion:
        currentRobot.panel.workspaceGenerationVersion + 1,
    });
  }

  function abortWorkspaceGeneration() {
    updateRobotPanelState(robotId, {
      workspaceGenerationPending: false,
      workspaceAbortVersion: currentRobot.panel.workspaceAbortVersion + 1,
    });
  }

  function commitWorkspaceSampleInput() {
    const nextValue = Number.parseInt(workspaceSampleInput, 10);
    if (!Number.isFinite(nextValue)) {
      setWorkspaceSampleInput(String(currentRobot.panel.workspaceSampleCount));
      return;
    }
    const clampedValue = Math.max(
      MIN_WORKSPACE_SAMPLE_COUNT,
      Math.min(MAX_WORKSPACE_SAMPLE_COUNT, Math.round(nextValue)),
    );
    updateWorkspaceSampleCount(clampedValue);
  }

  const useDegrees = currentRobot.panel.useDegrees;
  const highlightedJointName = getHighlightedJointName(currentRobot.robotId);
  const robotId = currentRobot.robotId;
  const syncActive = isSyncing(robotId);
  const syncSliderManipulationActive =
    manipulation?.syncMode &&
    managerState.activeSourceId === JOINT_SOURCE_ID.MANUAL;
  const dragManipulationActive =
    managerState.activeSourceId === JOINT_SOURCE_ID.DRAG;
  const canEdit =
    managerState.activeSourceId !== JOINT_SOURCE_ID.RESET &&
    managerState.activeSourceId !== JOINT_SOURCE_ID.ANIMATION &&
    !dragManipulationActive;

  function beginSliderManipulation() {
    beginManipulation(robotId, JOINT_SOURCE_ID.MANUAL);
  }

  function endSliderManipulation(cancel = false) {
    const nextCancel = cancel || sliderAbortHoveredRef.current;
    sliderAbortHoveredRef.current = false;
    setIsSliderAbortHovered(false);
    endManipulation({ cancel: nextCancel });
  }

  function applyAngle(
    index: number,
    displayValue: number,
    property: JointProperty | null,
  ) {
    const nextAngles = [...managerState.angles];
    nextAngles[index] = toManagerValue(displayValue, property, useDegrees);
    updateRobotJointAngles(robotId, nextAngles);
  }

  function updateOriginPoseFieldInput(
    field: keyof typeof currentRobot.visual.origin,
    value: string,
  ) {
    setOriginPoseInput((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function commitOriginPoseField(
    field: keyof typeof currentRobot.visual.origin,
  ) {
    const parsed = Number.parseFloat(originPoseInput[field]);
    const isRotationField =
      field === "roll" || field === "pitch" || field === "yaw";
    const nextValue = Number.isFinite(parsed)
      ? isRotationField && useDegrees
        ? parsed * RADIAN_FACTOR
        : parsed
      : currentRobot.visual.origin[field];
    const nextOrigin = {
      ...currentRobot.visual.origin,
      [field]: nextValue,
    };
    setOriginPoseInput(toOriginPoseInput(nextOrigin, useDegrees));
    updateRobotVisualBinding(robotId, {
      origin: nextOrigin,
    });
  }

  return (
    <div className="flex min-h-0 flex-col panel-body gap-2 overflow-hidden">
      <div className="panel panel-body flex flex-col gap-2">
        <label className="flex items-center justify-between gap-3 text-xs">
          <span>Degrees</span>
          <Toggle
            checked={useDegrees}
            onChange={(checked) =>
              updateRobotPanelState(robotId, {
                useDegrees: checked,
              })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs">
          <span>Collision Mesh</span>
          <Toggle
            checked={activeRobot.panel.showCollisionMap}
            onChange={(checked) =>
              updateRobotPanelState(robotId, {
                showCollisionMap: checked,
              })
            }
          />
        </label>
        <DisclosureSection
          title="Origin Pose"
          open={originPoseOpen}
          onToggle={() => setOriginPoseOpen((current) => !current)}
        >
          <div className="grid grid-cols-1 gap-2 text-xs">
            {(["x", "y", "z"] as const).map((field) => (
              <label
                key={field}
                className="grid min-w-0 grid-cols-[auto_1fr] items-center gap-2"
              >
                <span className="text-[rgb(var(--fg-muted))] uppercase">
                  {field}:
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <input
                    className="input-ghost w-28 text-right"
                    type="number"
                    step="0.1"
                    value={originPoseInput[field]}
                    onChange={(event) =>
                      updateOriginPoseFieldInput(field, event.target.value)
                    }
                    onBlur={() => commitOriginPoseField(field)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                        commitOriginPoseField(field);
                      }
                      if (event.key === "Escape") {
                        setOriginPoseInput(
                          toOriginPoseInput(
                            currentRobot.visual.origin,
                            useDegrees,
                          ),
                        );
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  <span className="text-[rgb(var(--fg-muted))]">m</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
            {(
              [
                ["roll", "R"],
                ["pitch", "P"],
                ["yaw", "Y"],
              ] as const
            ).map(([field, label]) => (
              <label
                key={field}
                className="grid min-w-0 grid-cols-[auto_1fr] items-center gap-2"
              >
                <span className="text-[rgb(var(--fg-muted))] uppercase">
                  {label}:
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <input
                    className="input-ghost w-28 text-right"
                    type="number"
                    step="0.1"
                    value={originPoseInput[field]}
                    onChange={(event) =>
                      updateOriginPoseFieldInput(field, event.target.value)
                    }
                    onBlur={() => commitOriginPoseField(field)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                        commitOriginPoseField(field);
                      }
                      if (event.key === "Escape") {
                        setOriginPoseInput(
                          toOriginPoseInput(
                            currentRobot.visual.origin,
                            useDegrees,
                          ),
                        );
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  <span className="text-[rgb(var(--fg-muted))]">
                    {useDegrees ? "°" : "rad"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </DisclosureSection>

        <DisclosureSection
          title="Workspace"
          open={workspaceOptionsOpen}
          onToggle={() => setWorkspaceOptionsOpen((current) => !current)}
          trailingContent={
            <Toggle
              checked={activeRobot.panel.showWorkspace}
              onChange={(checked) => {
                if (!checked) {
                  updateRobotPanelState(robotId, {
                    showWorkspace: false,
                  });
                  return;
                }
                if (activeRobot.panel.workspaceGeneratedSampleCount == null) {
                  generateWorkspace();
                  return;
                }
                showOrGenerateWorkspace();
              }}
            />
          }
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>Samples</span>
            <input
              className="input-ghost w-24 text-right"
              type="number"
              min={MIN_WORKSPACE_SAMPLE_COUNT}
              max={MAX_WORKSPACE_SAMPLE_COUNT}
              step={1000}
              value={workspaceSampleInput}
              onChange={(event) => {
                setWorkspaceSampleInput(event.target.value);
              }}
              onBlur={commitWorkspaceSampleInput}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                  commitWorkspaceSampleInput();
                }
                if (event.key === "Escape") {
                  setWorkspaceSampleInput(
                    String(activeRobot.panel.workspaceSampleCount),
                  );
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
          <div className="flex justify-end">
            <button
              className={`w-24 justify-center ${
                currentRobot.panel.workspaceGenerationPending
                  ? "button-danger"
                  : "button-ghost"
              }`}
              type="button"
              onClick={() => {
                if (currentRobot.panel.workspaceGenerationPending) {
                  abortWorkspaceGeneration();
                  return;
                }
                generateWorkspace(currentRobot.panel.workspaceSampleCount);
              }}
            >
              {currentRobot.panel.workspaceGenerationPending
                ? "Abort"
                : "Generate"}
            </button>
          </div>
        </DisclosureSection>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible">
        {rows.length === 0 ? (
          <div></div>
        ) : (
          <div className={`relative ${syncActive ? "pl-5" : ""}`}>
            {syncActive ? (
              <div
                ref={sliderAbortRef}
                className={`absolute bottom-0 left-0 top-0 z-20 flex w-5 items-center justify-center border-l border-t border-b text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                  syncSliderManipulationActive
                    ? isSliderAbortHovered
                      ? "cursor-pointer border-red-400/60 bg-red-500/15 text-red-100"
                      : "border-[rgb(var(--panel-border)/0.25)] bg-[rgb(var(--panel-bg)/0.9)] text-[rgb(var(--fg-muted))]"
                    : "border-[rgb(var(--panel-border)/0.1)] bg-[rgb(var(--panel-bg)/0.45)] text-[rgb(var(--fg-muted)/0.45)]"
                }`}
                style={{
                  writingMode: "vertical-rl",
                  textOrientation: "mixed",
                }}
              >
                Abort
              </div>
            ) : null}
            <div
              className="border-x border-t overflow-visible"
              style={{ borderColor: "rgb(var(--panel-border) / 0.1)" }}
            >
              <table className="panel-table">
                <tbody>
                  {rows.map((row) => {
                    const sliderConfig = getSliderConfig(
                      row.property,
                      useDegrees,
                    );
                    const displayValue = toDisplayValue(
                      row.angle,
                      row.property,
                      useDegrees,
                    );
                    const isHighlighted =
                      row.jointName === highlightedJointName;
                    return (
                      <tr
                        key={row.jointName}
                        className={
                          isHighlighted
                            ? "bg-[rgb(var(--panel-border)/0.05)]"
                            : undefined
                        }
                        onMouseEnter={() =>
                          setHighlightedJointName(robotId, row.jointName)
                        }
                        onMouseLeave={() => {
                          if (
                            getHighlightedJointName(robotId) === row.jointName
                          ) {
                            setHighlightedJointName(robotId, null);
                          }
                        }}
                      >
                        <td colSpan={2}>
                          <div className="mb-2 mr-1 ml-1 mt-1 flex flex-col gap-2 rounded-sm px-1 py-1">
                            <div className="flex items-start justify-between gap-4">
                              <div className="cell-mono text-xs uppercase tracking-wider">
                                {row.jointName}
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  className="input-ghost w-20 text-right"
                                  type="number"
                                  step={sliderConfig.step}
                                  min={sliderConfig.min}
                                  max={sliderConfig.max}
                                  value={formatValue(
                                    row.angle,
                                    row.property,
                                    useDegrees,
                                  )}
                                  disabled={!canEdit}
                                  onFocus={beginSliderManipulation}
                                  onBlur={() => endSliderManipulation(false)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                      event.currentTarget.blur();
                                      endSliderManipulation(true);
                                    }
                                  }}
                                  onChange={(event) => {
                                    const nextValue = Number.parseFloat(
                                      event.target.value,
                                    );
                                    if (!Number.isFinite(nextValue)) {
                                      return;
                                    }
                                    applyAngle(
                                      row.index,
                                      nextValue,
                                      row.property,
                                    );
                                  }}
                                />
                                <span className="text-xs text-[rgb(var(--fg-muted))]">
                                  {sliderConfig.unit}
                                </span>
                              </div>
                            </div>
                            <input
                              className="slider w-full"
                              type="range"
                              min={sliderConfig.min}
                              max={sliderConfig.max}
                              step={sliderConfig.step}
                              value={displayValue}
                              disabled={!canEdit}
                              onPointerDown={() => {
                                sliderPointerActiveRef.current = true;
                                beginSliderManipulation();
                              }}
                              onPointerUp={() => endSliderManipulation(false)}
                              onPointerCancel={() =>
                                endSliderManipulation(true)
                              }
                              onChange={(event) =>
                                applyAngle(
                                  row.index,
                                  Number(event.target.value),
                                  row.property,
                                )
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
