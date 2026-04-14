import { useState } from 'react';
import { createPortal } from 'react-dom';

import { useSendMessage } from '../../../features/socket/hooks/useSendMessage';

export interface ConnectOpcUaProps {
  addServer: (name: string, connectedUrl: string, backendport: string | null) => number;
}

function ConnectOpcUa({ addServer }: ConnectOpcUaProps) {
  const defaultUrls = [
    'opc.tcp://127.0.0.1:4840/freeopcua/server/',
    'opc.tcp://10.10.38.25:4840/freeopcua/server/',
    'opc.tcp://10.10.38.26:4840/freeopcua/server/',
    'opc.tcp://10.10.38.27:4840/freeopcua/server/',
    'opc.tcp://10.10.38.28:4840/freeopcua/server/',
  ];
  const lastUrl = localStorage.getItem('lastOpcUaUrl');
  const initialSavedUrls =
    lastUrl && !defaultUrls.includes(lastUrl) ? [...defaultUrls, lastUrl] : defaultUrls;

  const [serverName, setServerName] = useState('');
  const [open, setOpen] = useState(false);
  const [savedUrls] = useState<string[]>(initialSavedUrls);
  const [localUrl, setLocalUrl] = useState('');
  const { sendMessage } = useSendMessage();

  function handleConnect(serverId: number, url: string) {
    sendMessage('connect', { serverId, url });
  }
  return (
    <div>
      <button onClick={() => setOpen(true)} className="button-ghost">
        +
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center"
            onClick={() => setOpen(false)}
          >
            <section
              className="panel z-50 flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel-header">
                <div className="panel-title">OPCUA Connect</div>
                <button onClick={() => setOpen(false)} className="button-ghost">
                  ✕
                </button>
              </div>
              <div className="panel-body space-y-2">
                <input
                  value={localUrl}
                  onChange={(e) => setLocalUrl(e.target.value)}
                  aria-label="Server-Adress"
                  placeholder="OPC UA Server URL"
                  list="savedUrls"
                  className="input-ghost w-full text-left"
                />
                <datalist id="savedUrls">
                  {savedUrls.map((url) => (
                    <option key={url} value={url}>
                      {url}
                    </option>
                  ))}
                </datalist>
                <input
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="Server Name"
                  className="input-ghost w-full text-left"
                />
                <button
                  onClick={() => {
                    const trimmed = serverName.trim();
                    const trimmedUrl = localUrl.trim();
                    if (trimmed && trimmedUrl) {
                      const serverId = addServer(trimmed, trimmedUrl, null);
                      handleConnect(serverId, trimmedUrl);
                      setServerName('');
                    }
                    setOpen(false);
                  }}
                  className="button-ghost"
                >
                  Add Server
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default ConnectOpcUa;
