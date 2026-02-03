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


  const [showServerPopup, setShowServerPopup] = useState(false);
  const [showRobotPopup, setShowRobotPopup] = useState(false);

  const { sendMessage } = useSendMessage();

  function handleRemoveServer(serverId: number) {
    sendMessage("disconnect");
    removeServer(serverId);
  }

  return (
    <div className="flex flex-col overflow-y-auto h-full p-4 space-y-4">
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
            {/* opens popup window if clicked */}
            <button
              className="bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600"
              onClick={() => setShowServerPopup(true)}
            >
              +
            </button>

            {showServerPopup && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="w-full max-w-md bg-white p-4 rounded shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-lg font-bold">OPC-UA Connection</div>
                    <button
                      className="text-gray-500 hover:text-gray-800"
                      onClick={() => setShowServerPopup(false)}
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>                 
                    <ConnectOPCUA
                      jointManager={jointManager}
                      addServer={addServer}
                    />
                </div>
              </div>
            )}
            {servers.map(server => (
              <div key={server.id}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{server.name} (ID: {server.id})</div>
                    <button
                      className="text-sm"
                      onClick={() => handleRemoveServer(server.id)}
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
            <button
              className="bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600"
              onClick={() => setShowRobotPopup(true)}
            >
              +
            </button>

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
                    <Synchronize_Button jointManager={jointManager} />
                  </div>
                </div>
                <div className='ml-2'>
                  Connected to server:
                  <div>
                    {servers.find(s => s.id === robot.serverId)?.name} (ID: {robot.serverId})
                  </div>
                  <select
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
