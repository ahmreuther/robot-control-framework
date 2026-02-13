import { useState } from 'react';

import { useSendMessage } from '../../hooks/send-message';
import type { JointStateManager } from '../../hooks/useJointState';
import ConnectOPCUA from './ConnectOPCUA';
import Live_Status from './Live_Status';
import Synchronize_Button from './SynchroniseButton';
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

type Props = Partial<{
  servers: Server[];
  robots: Robot[];
  jointManager: JointStateManager;
  addServer: (name: string, connectedUrl: string, backendport: string | null) => void;
  removeServer: (id: number) => void;
  addRobot: (name: string) => void;
  removeRobot: (id: number) => void;
  connectRobotToServer: (robotId: number, serverId: number) => void;
  disconnectRobot: (robotId: number) => void;
  onSelectURDF: (model: ModelConfig) => void;
}>;

export default function RobotsServersManager(props: Props) {
  const {
    servers = [],
    robots = [],
    jointManager,
    addServer = () => {},
    removeServer = () => {},
    addRobot = () => {},
    removeRobot = () => {},
    connectRobotToServer = () => {},
    disconnectRobot = () => {},
    onSelectURDF = () => {},
  } = props;

  const [serversOpen, setServersOpen] = useState(true);
  const [robotsOpen, setRobotsOpen] = useState(true);

  const [openRobotIds, setOpenRobotIds] = useState<Record<number, boolean>>({});
  const toggleRobotOpen = (id: number) => setOpenRobotIds((prev) => ({ ...prev, [id]: !prev[id] }));
  const isRobotOpen = (id: number) => !!openRobotIds[id];

  const { sendMessage } = useSendMessage();

  function handleRemoveServer(serverId: number) {
    //TODO: toggle all robot sync on false connected to this server
    sendMessage('disconnect');
    removeServer(serverId);
  }

  return (
    <div className="flex flex-col overflow-y-auto h-full w-full space-y-2">
      <section className="panel">
        <header className="panel-header">
          <div className="panel-title">Servers</div>
          <div className="flex items-center gap-2">
            <ConnectOPCUA addServer={addServer} />
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
                      <Synchronize_Button jointManager={jointManager} />
                      <button
                        className="button-ghost"
                        onClick={() => toggleRobotOpen(robot.id)}
                        aria-expanded={open}
                      >
                        {open ? 'Hide' : 'Details'}
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
                    {open && <Live_Status />}
                  </ul>
                </section>
              );
            })}
        </div>
      </section>
    </div>
  );
}
