import type { Server } from '../../hooks/useServersAndRobots';

export interface AddressSpaceServerTabsProps {
  servers: Server[];
  activeServerId: number | null;
  onSelectServer: (serverId: number) => void;
}

export function AddressSpaceServerTabs(props: AddressSpaceServerTabsProps) {
  const { servers, activeServerId, onSelectServer } = props;

  if (!servers.length) {
    return null;
  }

  return (
    <nav className="panel-nav" role="tablist" aria-label="Address Space servers">
      {servers.map((server) => (
        <button
          key={server.id}
          role="tab"
          className="panel-tab"
          aria-selected={server.id === activeServerId}
          onClick={() => onSelectServer(server.id)}
          type="button"
        >
          {server.name}
        </button>
      ))}
    </nav>
  );
}
