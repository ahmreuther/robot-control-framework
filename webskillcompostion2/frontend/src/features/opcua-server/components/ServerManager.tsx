import { useState } from "react";

import { useOpcuaServer } from "../context/OpcuaServerContext";
import ConnectOpcUa from "./ConnectOpcUa";

export default function ServerManager() {
  const { servers, activeServerUrl, disconnectServer, selectServer, snapshot } =
    useOpcuaServer();
  const [serversOpen, setServersOpen] = useState(true);

  function handleRemoveServer(serverUrl: string) {
    disconnectServer(serverUrl);
  }

  function handleSelectServer(serverUrl: string) {
    selectServer(serverUrl);
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div className="panel-title">Servers</div>
        <div className="flex items-center gap-2">
          <ConnectOpcUa />
          <button
            className="button-ghost"
            onClick={() => setServersOpen(!serversOpen)}
            aria-expanded={serversOpen}
          >
            {serversOpen ? "▼" : "▶"}
          </button>
        </div>
      </header>
      {serversOpen && (
        <div className="panel-body flex flex-col gap-2">
          {servers.length === 0 && (
            <div className="text-xs text-[rgb(var(--fg-muted))]">
              No connected servers.
            </div>
          )}

          {servers.map((server) => (
            <section
              className={`panel ${activeServerUrl === server.serverUrl ? "active" : ""}`}
              key={server.serverUrl}
              onClick={() => handleSelectServer(server.serverUrl)}
            >
              <header className="panel-header cursor-pointer px-2 py-1">
                <div className="min-w-0">
                  <div className="text-xs font-semibold tracking-wider">
                    {shortServerName(server.serverUrl)}
                  </div>
                </div>
                <button
                  className="button-ghost"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemoveServer(server.serverUrl);
                  }}
                >
                  Disconnect
                </button>
              </header>
              <div className="px-2 py-1 text-xs">Motion Devices:</div>
              <ul className="list-panel">
                {server.motionDeviceIds.length === 0 && (
                  <li>No devices discovered.</li>
                )}
                {server.motionDeviceIds.map((motionDeviceId: string) => {
                  const motionDevice =
                    snapshot.server.motionDevicesById[motionDeviceId];
                  return motionDevice ? (
                    <li key={motionDeviceId}>{motionDevice.displayName}</li>
                  ) : null;
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function shortServerName(serverUrl: string): string {
  return serverUrl.replace("opc.tcp://", "").replace("/freeopcua/server/", "");
}
