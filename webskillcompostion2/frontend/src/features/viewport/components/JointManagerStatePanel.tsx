import { useEffect, useState } from "react";

import { useRobotControl } from "../../robot-control/context/RobotControlContext";
import type { JointStateSnapshot } from "../../robot-control/model/jointStateManager";

const EMPTY_MANAGER_STATE: JointStateSnapshot = {
  angles: [],
  activeSourceId: null,
  jointNames: [],
};

function formatAngle(value: number): string {
  return value.toFixed(4);
}

export default function JointManagerStatePanel() {
  const { activeRobot, getActiveJointManager } = useRobotControl();
  const manager = getActiveJointManager();
  const [snapshot, setSnapshot] = useState<JointStateSnapshot>(EMPTY_MANAGER_STATE);

  useEffect(() => {
    if (!manager) {
      setSnapshot(EMPTY_MANAGER_STATE);
      return;
    }

    setSnapshot(manager.getState());
    return manager.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });
  }, [manager]);

  return (
    <div className="panel w-80 max-w-[40vw]">
      <div className="panel-header">
        <div className="panel-title">Joint Manager</div>
      </div>
      <div className="panel-body overflow-auto">
        <table className="panel-table">
          <tbody>
            <tr>
              <td className="cell-muted">Robot</td>
              <td>{activeRobot?.displayName ?? "-"}</td>
            </tr>
            <tr>
              <td className="cell-muted">Active Source</td>
              <td className="cell-mono">{snapshot.activeSourceId ?? "-"}</td>
            </tr>
            <tr>
              <td className="cell-muted">Joint Count</td>
              <td>{snapshot.jointNames.length}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-2 overflow-auto border-x border-t border-[rgb(var(--panel-border)/0.1)]">
          <table className="panel-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Angle</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.jointNames.length === 0 ? (
                <tr>
                  <td colSpan={2} className="cell-muted">
                    No joint state available.
                  </td>
                </tr>
              ) : (
                snapshot.jointNames.map((jointName, index) => (
                  <tr key={jointName}>
                    <td className="cell-mono">{jointName}</td>
                    <td className="cell-mono">
                      {formatAngle(snapshot.angles[index] ?? 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
