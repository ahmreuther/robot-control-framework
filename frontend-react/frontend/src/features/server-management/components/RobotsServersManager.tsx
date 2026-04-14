import { useState } from 'react';

import { useSyncContext } from '../../../features/robot-control/contexts/SyncContext';
import { useSendMessage } from '../../../features/socket/hooks/useSendMessage';
import type { JointStateManager } from '../../robot-control/hooks/useJointState';
import ConnectOpcUa from './ConnectOpcUa';
import LiveStatus from './LiveStatus';
import SynchronizeButton from './SynchronizeButton';
import { type ModelConfig, URDFSelector } from './URDFSelector';

interface Robot {
  id: number;
  name: string;
  serverId: number | null;
}
interface Server {
  id: number;
  name: string;
  robotIds: number[];
}

interface Props {
  servers: Server[];
  robots: Robot[];
  jointManager: JointStateManager;
  addServer: (name: string, connectedUrl: string, backendport: string | null) => number;
  removeServer: (id: number) => void;
  addRobot: (name: string) => number;
  removeRobot: (id: number) => void;
  connectRobotToServer: (robotId: number, serverId: number) => void;
  disconnectRobot: (robotId: number) => void;
  onSelectURDF: (model: ModelConfig) => void;
}

export default function RobotsServersManager(props: Props) {
  const {
    servers,
    robots,
    jointManager,
    addServer,
    removeServer,
    addRobot,
    removeRobot,
    connectRobotToServer,
    disconnectRobot,
    onSelectURDF,
  } = props;

  const [serversOpen, setServersOpen] = useState(true);
  const [robotsOpen, setRobotsOpen] = useState(true);

  const [openRobotIds, setOpenRobotIds] = useState<Record<number, boolean>>({});
  const toggleRobotOpen = (id: number) => setOpenRobotIds((prev) => ({ ...prev, [id]: !prev[id] }));
  const isRobotOpen = (id: number) => !!openRobotIds[id];

  const { sendMessage } = useSendMessage();
  const { setIsSyncActive } = useSyncContext();

  function handleRemoveServer(serverId: number) {
    const connectedRobots = robots.filter((r) => r.serverId === serverId);
    if (connectedRobots.length > 0) {
      setIsSyncActive(false);
      sendMessage('cancel stream joint position', { serverId });
      sendMessage('cancel stream mode', { serverId });
    }
    sendMessage('disconnect', { serverId });
    removeServer(serverId);
  }

  return (
    <div className="flex flex-col overflow-y-auto h-full w-full space-y-2">
      <section className="panel">
        <header className="panel-header">
          <div className="panel-title">Servers</div>
          <div className="flex items-center gap-2">
            <ConnectOpcUa addServer={addServer} />
            <button
              className="button-ghost"
              onClick={() => setServersOpen(!serversOpen)}
              aria-expanded={serversOpen}
            >
              {serversOpen ? '▼' : '▶'}
            </button>
          </div>
        </header>
        {serversOpen &&
          servers.map((server) => (
            <section className="panel ml-4" key={server.id}>
              <header className="panel-header px-2 py-1">
                <div className="text-xs font-semibold tracking-wider">{server.name}</div>
                <button className="button-ghost" onClick={() => handleRemoveServer(server.id)}>
                  Remove
                </button>
              </header>
              <div className="px-2 py-1 text-xs">Connected Robots:</div>
              <ul className="list-panel">
                {server.robotIds.map((rid) => {
                  const robot = robots.find((r) => r.id === rid);
                  return robot ? <li key={rid}>{robot.name}</li> : null;
                })}
              </ul>
            </section>
          ))}
      </section>
      <section className="panel">
        <header className="panel-header">
          <div className="panel-title">Robots</div>
          <div className="flex items-center gap-2">
            <URDFSelector addRobot={addRobot} onSelect={onSelectURDF} />
            <button
              className="button-ghost"
              onClick={() => setRobotsOpen(!robotsOpen)}
              aria-expanded={robotsOpen}
            >
              {robotsOpen ? '▼' : '▶'}
            </button>
          </div>
        </header>
        <div>
          {robotsOpen &&
            robots.map((robot) => {
              const open = isRobotOpen(robot.id);
              return (
                <section key={robot.id} className="panel ml-4">
                  <header className="panel-header px-2 py-1">
                    <div className="text-xs font-semibold tracking-wider">{robot.name}</div>
                    <div className="flex items-center gap-2">
                      <SynchronizeButton jointManager={jointManager} serverId={robot.serverId} />
                      <button
                        className={`button-ghost ${open ? 'active' : ''}`}
                        onClick={() => toggleRobotOpen(robot.id)}
                        aria-expanded={open}
                      >
                        Details
                      </button>
                      <button className="button-ghost" onClick={() => removeRobot(robot.id)}>
                        Remove
                      </button>
                    </div>
                  </header>
                  <div className="px-2 py-1 text-xs">Connected Server:</div>
                  <ul className="list-panel">
                    <li>
                      <select
                        id={`connect-server-${robot.id}`}
                        className="select"
                        value={robot.serverId ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            disconnectRobot(robot.id);
                          } else {
                            const sid = Number(value);
                            if (sid) connectRobotToServer(robot.id, sid);
                          }
                        }}
                      >
                        <option className="select" value="">
                          None
                        </option>
                        {servers.map((server) => (
                          <option className="select" key={server.id} value={server.id}>
                            {server.name}
                          </option>
                        ))}
                      </select>
                    </li>
                    {open && <LiveStatus serverId={robot.serverId} />}
                  </ul>
                </section>
              );
            })}
        </div>
      </section>
    </div>
  );
}
