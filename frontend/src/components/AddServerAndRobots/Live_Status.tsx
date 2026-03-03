import { useRobotInfoContext } from '../../contexts/RobotInfoContext';

export interface LiveStatusProps {
  serverId: number | null;
}

export default function Live_Status({ serverId }: LiveStatusProps) {
  const { getServerRobotState } = useRobotInfoContext();
  const { robotName, robotStatus, robotMode, axleValues, robotInfo } = getServerRobotState(serverId);
  const jointsText =
    axleValues && Object.keys(axleValues).length === 0
      ? ''
      : axleValues
        ? Object.entries(axleValues)
            .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
            .join(', ')
        : '';

  const rows: [string, string][] = [
    ['Connected Robot', robotName ?? ''],
    ['Manufacturer', robotInfo?.manufacturer ?? ''],
    ['Serial Number', robotInfo?.serialNumber ?? ''],
    ['Status', robotStatus ?? ''],
    ['Mode', robotMode ?? ''],
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
                      ? robotStatus === 'Connected'
                        ? 'cell-mono text-green-400'
                        : 'cell-mono text-yellow-400'
                      : 'cell-mono'
                  }
                >
                  {String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
