import { useState } from 'react';

import type {
  ApplicationController,
  ApplicationSnapshot,
} from '../../../app/model/applicationController';
import ConnectOpcUa from './ConnectOpcUa';

export interface ServerManagerProps {
  controller: ApplicationController;
  snapshot: ApplicationSnapshot;
}

export default function ServerManager({
  controller,
  snapshot,
}: ServerManagerProps) {
  const [serversOpen, setServersOpen] = useState(true);
  const [serverLabels, setServerLabels] = useState<Record<string, string>>({});
  const servers = Object.values(snapshot.server.byUrl);

  function handleRemoveServer(serverUrl: string) {
    controller.disconnectServer(serverUrl);
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div className="panel-title">Servers</div>
        <div className="flex items-center gap-2">
          <ConnectOpcUa
            controller={controller}
            onLabel={(serverUrl, label) =>
              setServerLabels((current) => ({
                ...current,
                [serverUrl]: label,
              }))
            }
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
      {serversOpen &&
        servers.map((server) => (
          <section className="panel ml-4" key={server.serverUrl}>
            <header className="panel-header px-2 py-1">
              <div className="text-xs font-semibold tracking-wider">
                {serverLabels[server.serverUrl] ?? shortServerName(server.serverUrl)}
              </div>
              <button
                className="button-ghost"
                onClick={() => handleRemoveServer(server.serverUrl)}
              >
                Remove
              </button>
            </header>
            <div className="px-2 py-1 text-xs">Connected Robots:</div>
            <ul className="list-panel">
              {server.robotIds.length === 0 && <li>No robots discovered.</li>}
              {server.robotIds.map((robotId) => {
                const robot = snapshot.robot.byId[robotId];
                return robot ? <li key={robotId}>{robot.displayName}</li> : null;
              })}
            </ul>
          </section>
        ))}
    </section>
  );
}

function shortServerName(serverUrl: string): string {
  return serverUrl.replace('opc.tcp://', '').replace('/freeopcua/server/', '');
}
