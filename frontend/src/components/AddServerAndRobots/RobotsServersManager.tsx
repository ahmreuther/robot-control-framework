import { useState } from 'react';
import Live_Status from '../MenuComponents/TwinDashboardComponents/Live_Status';
import Twin_Dashboard from '../MenuComponents/TwinDashboardComponents/Twin_Dashboard';
import ConnectOPCUA from './ConnectOPCUA';
import AddRobot from './AddRobot';
import type { JointStateManager } from '../../hooks/useJointState';
import { useSendMessage } from '../../hooks/send-message';
import type { ModelConfig } from '../MenuComponents/ControlsComponents/URDFSelector';
import Synchronize_Button from './SynchroniseButton';

type Robot = { id: number; name: string; serverId: number | null };
type Server = { id: number; name: string; robotIds: number[] };

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

  // track which robot detail panels are open
  const [openRobotIds, setOpenRobotIds] = useState<Record<number, boolean>>({});
  const toggleRobotOpen = (id: number) => setOpenRobotIds(prev => ({ ...prev, [id]: !prev[id] }));
  const isRobotOpen = (id: number) => !!openRobotIds[id];

  const [showRobotPopup, setShowRobotPopup] = useState(false);

  const { sendMessage } = useSendMessage();

  function handleRemoveServer(serverId: number) {
    sendMessage("disconnect");
    removeServer(serverId);
  }

  return (
    <div className="flex flex-col overflow-y-auto h-full w-full">
        <section className="panel">
          <header className="panel-header">
            <div className="panel-title">Servers</div>
            <div className="flex items-center gap-2">
              <ConnectOPCUA
                jointManager={jointManager}
                addServer={addServer}
              />
              <button
                className="button-ghost"
                onClick={() => setServersOpen(!serversOpen)}
                aria-expanded={serversOpen}
              >
              {serversOpen ? '▼' : '▶'}
            </button>
            </div>
          </header>    
            {serversOpen && servers.map(server => (
              <section className="panel ml-4" key={server.id}>
                <header className="panel-header">
                  <div className="panel-title">{server.name}</div>
                    <button
                      className="button-ghost"
                      onClick={() => handleRemoveServer(server.id)}
                    >
                      Remove
                    </button>
                  </header>
                  <div className='px-2 py-1 text-xs font-semibold uppercase'>
                    Connected Robots:
                  </div>
                    <ul className='list-panel'>
                      {server.robotIds.map(rid => {
                        const robot = robots.find(r => r.id === rid);
                        return robot ? (
                          <li key={rid}>
                            {robot.name}
                          </li>
                        ) : null;
                      })}
                    </ul>
                </section>
            ))}
          </section>
      <section className='panel'>
        <header className='panel-header'>
          <div className='panel-title'>Robots</div>
          <div className="flex items-center gap-2">
            <button
              className="button-ghost"
              onClick={() => setShowRobotPopup(true)}
            >
              +
            </button>
            <button
                className="button-ghost"
                onClick={() => setRobotsOpen(!robotsOpen)}
                aria-expanded={robotsOpen}
              >
              {robotsOpen ? '▼' : '▶'}
            </button>
          </div>
        </header>
        {showRobotPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="w-full max-w-md bg-white p-4 rounded shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-lg font-bold text-black">Add Robot</div>
                    <button
                      className="text-gray-500 hover:text-gray-800"
                      onClick={() => setShowRobotPopup(false)}
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>                 
                    <AddRobot
                      addRobot={addRobot}
                      onSelectURDF={(model) => {
                        onSelectURDF(model);
                        setShowRobotPopup(false);
                      }}
                    />
                </div>
              </div>
        )}
        <div>
            {robotsOpen && robots.map(robot => {
              const open = isRobotOpen(robot.id);
              return (
              <section key={robot.id} className="panel ml-4">
                  <header className="panel-header">
                    <div className="panel-title">{robot.name}</div>
                    <div className="flex items-center gap-2">
                    <button
                      className="button-ghost"
                      onClick={() => toggleRobotOpen(robot.id)}
                      aria-expanded={open}
                    >
                      {open ? 'Hide' : 'Details'}
                    </button>
                    <button
                      className="button-ghost"
                      onClick={() => removeRobot(robot.id)}
                    >
                      Remove
                    </button>
                    <Synchronize_Button jointManager={jointManager} />
                  </div>
                  </header>
                  <div className='px-2 py-1 text-xs font-semibold uppercase'>
                    Connected Server:
                  </div>
                  <ul className='list-panel'>
                    {servers.find(s => s.id === robot.serverId)?.name}
                    {/* <select
                    id={`connect-server-${robot.id}`}
                    className="bg-white text-black border border-gray-300 rounded px-2 py-1"
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
                      <option key={server.id} value={server.id}>{server.name}</option>
                    ))}

                  </select>
                  {open && (
                  <div>
                    <Live_Status />
                    <Twin_Dashboard />
                  </div>
                )} */}
                  </ul>
              </section>
            )})}
          </div>
      </section>
      </div>
  );
}
