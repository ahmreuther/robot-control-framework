import type { Robot, RobotSessionInfo } from "../../../entities/robot/model/types";

export interface RobotDetailsProps {
  robot: Robot;
  motionDevice: RobotSessionInfo | null;
  syncing: boolean;
}

export default function RobotDetails({
  robot,
  motionDevice,
  syncing,
}: RobotDetailsProps) {
  const jointsText =
    Object.keys(robot.joints.axisValues).length === 0
      ? ""
      : Object.entries(robot.joints.axisValues)
          .map(([key, value]) => `${key}: ${value.toFixed(2)}`)
          .join(", ");
  const urdfAxisCount = robot.visual.orderedUrdfJointNames.length;
  const motionDeviceAxisCount = motionDevice
    ? Object.keys(motionDevice.opcua.axes).length
    : 0;
  const hasAxisMismatch =
    !!motionDevice &&
    urdfAxisCount > 0 &&
    motionDeviceAxisCount > 0 &&
    urdfAxisCount !== motionDeviceAxisCount;

  const rows: [string, string][] = [
    ["Connected Motion Device", motionDevice?.displayName ?? robot.motionDeviceId ?? ""],
    ["Motion Device Node", motionDevice?.motionDevice.nodeId ?? ""],
    ["Manufacturer", motionDevice?.info.manufacturer ?? robot.info.manufacturer ?? ""],
    ["Serial Number", motionDevice?.info.serialNumber ?? robot.info.serialNumber ?? ""],
    ["Status", robot.status ?? ""],
    ["Sync", syncing ? "active" : "inactive"],
    ["Mode", robot.mode ?? ""],
    ["URDF", robot.visual.urdfLabel ?? ""],
    ["URDF Joints", urdfAxisCount ? String(urdfAxisCount) : ""],
    ["Motion Device Axes", motionDeviceAxisCount ? String(motionDeviceAxisCount) : ""],
    [
      "Origin",
      `${robot.visual.origin.x.toFixed(2)}, ${robot.visual.origin.y.toFixed(2)}, ${robot.visual.origin.z.toFixed(2)} | ${robot.visual.origin.roll.toFixed(2)}, ${robot.visual.origin.pitch.toFixed(2)}, ${robot.visual.origin.yaw.toFixed(2)}`,
    ],
    ["Server", robot.serverUrl === "local://manual" ? "offline" : robot.serverUrl],
    ["Joints", jointsText],
  ];

  return (
    <section className="panel">
      <div className="overflow-auto">
        <table className="panel-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td className="cell-muted">{label}</td>
                <td
                  className={
                    label === "Status"
                      ? robot.status === "connected"
                        ? "cell-mono text-green-400"
                        : "cell-mono text-yellow-400"
                      : "cell-mono"
                  }
                >
                  {String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {hasAxisMismatch && (
          <div className="px-1 py-2 text-[10px] text-[rgb(var(--warn))]">
            Warning: URDF joint count and bound motion-device axis count do not match.
          </div>
        )}
      </div>
    </section>
  );
}
