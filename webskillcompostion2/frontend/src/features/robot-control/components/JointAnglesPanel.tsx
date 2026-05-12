import { useEffect, useMemo, useState } from "react";

import { useRobotControl } from "../context/RobotControlContext";
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
    updateRobotJointAngles,
    updateRobotPanelState,
  } = useRobotControl();
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
  const robotId = activeRobot.robotId;
  const canEdit =
    managerState.activeSourceId === null ||
    managerState.activeSourceId === JOINT_SOURCE_ID.MANUAL;
  const sliderMin = useDegrees ? -360 : -2 * Math.PI;
  const sliderMax = useDegrees ? 360 : 2 * Math.PI;
  const sliderStep = useDegrees ? 1 : 0.01;

  function applyAngle(index: number, displayValue: number) {
    const nextAngles = rows.map((row) => row.angle);
    nextAngles[index] = toManagerAngle(displayValue, useDegrees);
    updateRobotJointAngles(robotId, nextAngles);
  }

  return (
    <div className="flex min-h-0 flex-col panel-body gap-2 overflow-hidden">
      <div
        className="border-x border-t"
        style={{ borderColor: "rgb(var(--panel-border) / 0.1)" }}
      >
        <table className="panel-table">
          <tbody>
            <tr>
              <td className="cell-muted">Degrees</td>
              <td className="text-right">
                <input
                  type="checkbox"
                  checked={useDegrees}
                  onChange={(event) =>
                    updateRobotPanelState(robotId, {
                      useDegrees: event.target.checked,
                    })
                  }
                />
              </td>
            </tr>
            <tr>
              <td className="cell-muted">Collision Map</td>
              <td className="text-right">
                <input
                  type="checkbox"
                  checked={activeRobot.panel.showCollisionMap}
                  onChange={(event) =>
                    updateRobotPanelState(robotId, {
                      showCollisionMap: event.target.checked,
                    })
                  }
                />
              </td>
            </tr>
            <tr>
              <td className="cell-muted">Workspace</td>
              <td className="text-right">
                <input
                  type="checkbox"
                  checked={activeRobot.panel.showWorkspace}
                  onChange={(event) =>
                    updateRobotPanelState(robotId, {
                      showWorkspace: event.target.checked,
                    })
                  }
                />
              </td>
            </tr>
          </tbody>
        </table>
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
                  return (
                    <tr key={row.jointName}>
                      <td colSpan={2}>
                        <div className="flex flex-col gap-2 mb-2 mr-1 ml-1 mt-1">
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
