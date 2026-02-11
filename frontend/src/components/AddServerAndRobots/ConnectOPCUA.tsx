import { useState, useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSendMessage } from "../../hooks/send-message";
import { RobotInfoContext } from "../../contexts/RobotInfoContext";

export interface ConnectOPCUAProps {
  addServer: (name: string, connectedUrl: string, backendport: string | null) => void;
}

function ConnectOPCUA({ addServer }: ConnectOPCUAProps) {
  const defaultUrls = [
    "opc.tcp://127.0.0.1:4840/freeopcua/server/",
    "opc.tcp://10.10.38.26:4840/freeopcua/server/",
    "opc.tcp://10.10.38.27:4840/freeopcua/server/",
    "opc.tcp://10.10.38.28:4840/freeopcua/server/"
  ];
  const [serverName, setServerName] = useState("");
  const [open, setOpen] = useState(false);
  const [savedUrls, setSavedUrls] = useState<string[]>(defaultUrls);
  const [localUrl, setLocalUrl] = useState<string>();
  const { sendMessage } = useSendMessage();
  const isConnected = useContext(RobotInfoContext).robotStatus === "Connected";

  useEffect(() => {
    const lastUrl = localStorage.getItem("lastOpcUaUrl");
    if (lastUrl && !savedUrls.includes(lastUrl)) {
      setSavedUrls((prev) => [...prev, lastUrl]);
    }
  }, []);

  function handleConnect() {
    sendMessage("connect", localUrl);
  }
  return (
    <div>
      <button onClick={() => setOpen(true)} className="button-ghost">+</button>
      {open && createPortal(
        <div
          className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <section className="panel z-50 flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <div className="panel-title">OPCUA Connect</div>
              <button onClick={() => setOpen(false)} className="button-ghost">✕</button>
            </div>
            <div className="panel-body space-y-2">
              <input
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                aria-label="Server-Adress"
                placeholder="OPC UA Server URL"
                list="savedUrls"
                disabled={isConnected}
                className="input-ghost w-full text-left"
              />
              <datalist id="savedUrls">
                {savedUrls.map((url) => (
                  <option key={url} value={url}>{url}</option>
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
                  if (trimmed) {
                    addServer(trimmed, localUrl.trim(), null);
                    handleConnect();
                    setServerName("");
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
        document.body
      )}
    </div>
  );
}

export default ConnectOPCUA;


