import { useState } from 'react';

import type {
  ApplicationController,
  ApplicationSnapshot,
} from '../../../app/model/applicationController';
import LiveStatus from './LiveStatus';
import SynchronizeButton from './SynchronizeButton';
import { type ModelConfig, URDFSelector } from './URDFSelector';

export interface RobotManagerProps {
  controller: ApplicationController;
  snapshot: ApplicationSnapshot;
}

export default function RobotManager({
  controller,
  snapshot,
}: RobotManagerProps) {
  const [robotsOpen, setRobotsOpen] = useState(true);
  const [openRobotIds, setOpenRobotIds] = useState<Record<string, boolean>>({});
  const robots = Object.values(snapshot.robot.byId);
  const activeRobotId = snapshot.robot.activeRobotId;

  function toggleRobotOpen(robotId: string) {
    setOpenRobotIds((prev) => ({ ...prev, [robotId]: !prev[robotId] }));
  }

  function handleSelectURDF(model: ModelConfig) {
    if (!activeRobotId) return;
    controller.updateRobotVisualBinding(activeRobotId, {
      urdfId: model.id,
      urdfLabel: model.label,
      urdfUrl: model.url,
    });
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div className="panel-title">Robots</div>
        <div className="flex items-center gap-2">
          <URDFSelector disabled={!activeRobotId} onSelect={handleSelectURDF} />
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
            const open = !!openRobotIds[robot.robotId];
            return (
              <section key={robot.robotId} className="panel ml-4">
                <header className="panel-header px-2 py-1">
                  <button
                    className={`text-xs font-semibold tracking-wider text-left ${
                      snapshot.robot.activeRobotId === robot.robotId
                        ? 'text-[rgb(var(--brand))]'
                        : ''
                    }`}
                    onClick={() => controller.selectRobot(robot.robotId)}
                  >
                    {robot.displayName}
                  </button>
                  <div className="flex items-center gap-2">
                    <SynchronizeButton
                      controller={controller}
                      robotId={robot.robotId}
                    />
                    <button
                      className={`button-ghost ${open ? 'active' : ''}`}
                      onClick={() => toggleRobotOpen(robot.robotId)}
                      aria-expanded={open}
                    >
                      Details
                    </button>
                    <button
                      className="button-ghost"
                      disabled
                      title="Robots are discovered from the OPC UA server for now."
                    >
                      Remove
                    </button>
                  </div>
                </header>
                <div className="px-2 py-1 text-xs">Connected Server:</div>
                <ul className="list-panel">
                  <li>
                    <select
                      id={`connect-server-${robot.robotId}`}
                      className="select"
                      value={robot.serverUrl}
                      disabled
                    >
                      <option className="select" value={robot.serverUrl}>
                        {shortServerName(robot.serverUrl)}
                      </option>
                    </select>
                  </li>
                  {open && <LiveStatus robot={robot} />}
                </ul>
              </section>
            );
          })}
      </div>
    </section>
  );
}

function shortServerName(serverUrl: string): string {
  return serverUrl.replace('opc.tcp://', '').replace('/freeopcua/server/', '');
}
