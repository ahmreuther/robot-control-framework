import type { Robot } from '../../../entities/robot/model/types';

export interface LiveStatusProps {
  robot: Robot;
}

export default function LiveStatus({ robot }: LiveStatusProps) {
  const jointsText =
    Object.keys(robot.joints.axisValues).length === 0
      ? ''
      : Object.entries(robot.joints.axisValues)
          .map(([axis, value]) => `${axis}: ${value.toFixed(2)}`)
          .join(', ');

  const rows: [string, string][] = [
    ['Connected Robot', robot.displayName],
    ['Manufacturer', robot.info.manufacturer ?? ''],
    ['Serial Number', robot.info.serialNumber ?? ''],
    ['Status', robot.status],
    ['Mode', robot.mode ?? ''],
    ['Joints', jointsText],
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
                    label === 'Status'
                      ? robot.status === 'connected'
                        ? 'cell-mono text-green-400'
                        : 'cell-mono text-yellow-400'
                      : 'cell-mono'
                  }
                >
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
