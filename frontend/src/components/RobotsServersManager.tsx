import { useState } from 'react';
import Live_Status from './MenuComponents/TwinDashboardComponents/Live_Status';
import Twin_Dashboard from './MenuComponents/TwinDashboardComponents/Twin_Dashboard';

type Robot = { id: number; name: string; serverId: number | null };
type Server = { id: number; name: string; robotIds: number[] };

type Props = Partial<{
  servers: Server[];
  robots: Robot[];
  addServer: (name: string) => void;
  removeServer: (id: number) => void;
  addRobot: (name: string) => void;
  removeRobot: (id: number) => void;
  connectRobotToServer: (robotId: number, serverId: number) => void;
  disconnectRobot: (robotId: number) => void;
}>;

export default function RobotsServersManager(props: Props) {
  const {
    servers = [],
    robots = [],
    addServer = () => {},
    removeServer = () => {},
    addRobot = () => {},
    removeRobot = () => {},
    connectRobotToServer = () => {},
    disconnectRobot = () => {},

  } = props;

  const [serversOpen, setServersOpen] = useState(true);
  const [robotsOpen, setRobotsOpen] = useState(true);
  
  const [newServerName, setNewServerName] = useState('');
  const [newRobotName, setNewRobotName] = useState('');

  // track which robot detail panels are open
  const [openRobotIds, setOpenRobotIds] = useState<Record<number, boolean>>({});
  const toggleRobotOpen = (id: number) => setOpenRobotIds(prev => ({ ...prev, [id]: !prev[id] }));
  const isRobotOpen = (id: number) => !!openRobotIds[id];


  return (
    <div className="flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Servers</h2>
          <button
            className="text-sm"
            onClick={() => setServersOpen(!serversOpen)}
            aria-expanded={serversOpen}
          >
            {serversOpen ? '▼' : '▶'}
          </button>
        </div>
        {serversOpen && (
          <div className='ml-2'>
            <div>
              <input
                className="w-full"
                type="text"
                placeholder="Server name"
                value={newServerName}
                onChange={e => setNewServerName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    addServer(newServerName.trim());
                    setNewServerName('');
                    e.currentTarget.blur();
                  }
                }}
              />
            </div>
            {servers.map(server => (
              <div key={server.id}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{server.name} (ID: {server.id})</div>
                    <button
                      className="text-sm"
                      onClick={() => removeServer(server.id)}
                    >
                      Remove
                    </button>
                </div>

                <div className='ml-2'>Connected Robots:
                  <ul>
                    {server.robotIds.map(rid => {
                      const robot = robots.find(r => r.id === rid);
                      return robot ? (
                        <li key={rid}>
                          {robot.name} (ID: {robot.id})
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )} 
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Robots</h2>
          <button
            className="text-sm"
            onClick={() => setRobotsOpen(!robotsOpen)}
            aria-expanded={robotsOpen}
          >
            {robotsOpen ? '▼' : '▶'}
          </button>
        </div>

        {robotsOpen && (
          <div className='ml-2'>
            <div>
              <input
                className="w-full"
                type="text"
                placeholder="Robot name"
                value={newRobotName}
                onChange={e => setNewRobotName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    addRobot(newRobotName.trim());
                    setNewRobotName('');
                    e.currentTarget.blur();
                  }
                }}
              />
            </div>
            {robots.map(robot => {
              const open = isRobotOpen(robot.id);
              return (
              <div key={robot.id} className="border-b border-gray-700 pb-2 mb-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{robot.name} (ID: {robot.id})</div>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-sm"
                      onClick={() => toggleRobotOpen(robot.id)}
                      aria-expanded={open}
                    >
                      {open ? 'Hide' : 'Details'}
                    </button>
                    <button
                      className="text-sm"
                      onClick={() => removeRobot(robot.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className='ml-2'>
                  Connected to server:
                  <div>
                    {servers.find(s => s.id === robot.serverId)?.name} (ID: {robot.serverId})
                  </div>
                  <select
                    id={`connect-server-${robot.id}`}
                    className="text-black"
                    value={robot.serverId ?? ''}
                    onChange={e => {
                      const value = e.target.value;
                      if (value === "") {
                        disconnectRobot(robot.id);
                      } else {
                        const sid = Number(value);
                        if (sid) connectRobotToServer(robot.id, sid);
                      }
                    }}
                  >
                    <option value="">None</option>
                    {servers.map(server => (
                      <option key={server.id} value={server.id}>{server.name} (ID: {server.id})</option>
                    ))}

                  </select>
                </div>

                {open && (
                  <div>
                    <Live_Status />
                    <Twin_Dashboard />
                  </div>
                )}
              </div>
            )})}
          </div>
        )}
      </div>
    </div>
  );
}
