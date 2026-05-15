import { useEffect, useMemo, useState } from "react";

import { useRobotControl } from "../context/RobotControlContext";
import { useRobotInteraction } from "../context/RobotInteractionContext";
import {
  JOINT_SOURCE_ID,
  type JointStateSnapshot,
} from "../model/jointStateManager";

const DEGREE_FACTOR = 180 / Math.PI;
const RADIAN_FACTOR = Math.PI / 180;

function toDisplayAngle(value: number, useDegrees: boolean): number {
  return useDegrees ? value * DEGREE_FACTOR : value;
}

function toManagerAngle(value: number, useDegrees: boolean): number {
  return useDegrees ? value * RADIAN_FACTOR : value;
}

function formatAngle(value: number, useDegrees: boolean): string {
  const digits = useDegrees ? 1 : 3;
  return toDisplayAngle(value, useDegrees).toFixed(digits);
}

const EMPTY_MANAGER_STATE: JointStateSnapshot = {
  angles: [],
  activeSourceId: null,
  jointNames: [],
};

export default function JointAnglesPanel() {
  const {
    activeRobot,
    getActiveJointManager,
    isSyncing,
    updateRobotJointAngles,
    updateRobotPanelState,
  } = useRobotControl();
  const {
    beginManipulation,
    endManipulation,
    getHighlightedJointName,
    isAbortAreaHovered,
  } = useRobotInteraction();
  const manager = getActiveJointManager();
  const [managerState, setManagerState] =
    useState<JointStateSnapshot>(EMPTY_MANAGER_STATE);

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

  const rows = useMemo(
    () =>
      managerState.jointNames.map((jointName, index) => ({
        jointName,
        index,
        angle: managerState.angles[index] ?? 0,
      })),
    [managerState.angles, managerState.jointNames],
  );

  if (!activeRobot) {
    return <div></div>;
  }

  if (!manager) {
    return <div></div>;
  }

  const useDegrees = activeRobot.panel.useDegrees;
  const highlightedJointName = getHighlightedJointName(activeRobot.robotId);
  const robotId = activeRobot.robotId;
  const syncActive = isSyncing(robotId);
  const canEdit =
    managerState.activeSourceId !== JOINT_SOURCE_ID.RESET &&
    managerState.activeSourceId !== JOINT_SOURCE_ID.ANIMATION;
  const sliderMin = useDegrees ? -360 : -2 * Math.PI;
  const sliderMax = useDegrees ? 360 : 2 * Math.PI;
  const sliderStep = useDegrees ? 1 : 0.01;

  function beginSliderManipulation() {
    if (!syncActive) return;
    beginManipulation(robotId, JOINT_SOURCE_ID.MANUAL);
  }

  function endSliderManipulation(cancel = false) {
    if (!syncActive) return;
    endManipulation({ cancel: cancel || isAbortAreaHovered });
  }

  function applyAngle(index: number, displayValue: number) {
    const nextAngles = rows.map((row) => row.angle);
    nextAngles[index] = toManagerAngle(displayValue, useDegrees);
    updateRobotJointAngles(robotId, nextAngles);
  }

  return (
    <div className="flex min-h-0 flex-col panel-body gap-2 overflow-hidden">
      <div className="panel panel-body flex flex-col gap-2">
        <label className="flex items-center justify-between gap-3 text-xs">
          <span>Degrees</span>
          <input
            type="checkbox"
            checked={useDegrees}
            onChange={(event) =>
              updateRobotPanelState(robotId, {
                useDegrees: event.target.checked,
              })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs">
          <span>Collision Map</span>
          <input
            type="checkbox"
            checked={activeRobot.panel.showCollisionMap}
            onChange={(event) =>
              updateRobotPanelState(robotId, {
                showCollisionMap: event.target.checked,
              })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs">
          <span>Workspace</span>
          <input
            type="checkbox"
            checked={activeRobot.panel.showWorkspace}
            onChange={(event) =>
              updateRobotPanelState(robotId, {
                showWorkspace: event.target.checked,
              })
            }
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {rows.length === 0 ? (
          <div></div>
        ) : (
          <div
            className="border-x border-t overflow-hidden"
            style={{ borderColor: "rgb(var(--panel-border) / 0.1)" }}
          >
            <table className="panel-table">
              <tbody>
                {rows.map((row) => {
                  const displayValue = toDisplayAngle(row.angle, useDegrees);
                  const isHighlighted = row.jointName === highlightedJointName;
                  return (
                    <tr
                      key={row.jointName}
                      className={
                        isHighlighted
                          ? "bg-[rgb(var(--panel-border)/0.05)]"
                          : undefined
                      }
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
                                step={sliderStep}
                                value={formatAngle(row.angle, useDegrees)}
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
                                  applyAngle(row.index, nextValue);
                                }}
                              />
                              <span className="text-xs text-[rgb(var(--fg-muted))]">
                                {useDegrees ? "°" : "rad"}
                              </span>
                            </div>
                          </div>
                          <input
                            className="slider w-full"
                            type="range"
                            min={sliderMin}
                            max={sliderMax}
                            step={sliderStep}
                            value={displayValue}
                            disabled={!canEdit}
                            onPointerDown={beginSliderManipulation}
                            onPointerUp={() => endSliderManipulation(false)}
                            onPointerCancel={() => endSliderManipulation(true)}
                            onChange={(event) =>
                              applyAngle(row.index, Number(event.target.value))
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
        )}
      </div>
    </div>
  );
}
