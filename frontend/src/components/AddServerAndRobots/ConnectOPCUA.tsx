import { useState, useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { UrlContext } from "../../contexts/UrlContext";
import { useSendMessage } from "../../hooks/send-message";
import { RobotInfoContext } from "../../contexts/RobotInfoContext";
import { type JointStateManager } from "../../hooks/useJointState";

export interface ConnectOPCUAProps {
  jointManager: JointStateManager;
  addServer: (name: string, connectedUrl: string, backendport: string | null) => void;
}

function ConnectOPCUA({ jointManager, addServer }: ConnectOPCUAProps) {
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState("opc.tcp://127.0.0.1:4840/freeopcua/server/");
  const [serverName, setServerName] = useState("");
  const { setUrl } = useContext(UrlContext);
  const { sendMessage } = useSendMessage();
  const isConnected = useContext(RobotInfoContext).robotStatus === "Connected";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const lastUrl = localStorage.getItem("lastOpcUaUrl");
    if (lastUrl) {
      setSavedUrl(lastUrl);
    }
  }, []);

  function handleConnect() {
    sendMessage("connect", localUrl);
    const trimmedUrl = localUrl.trim();
    if (trimmedUrl) {
      setUrl(trimmedUrl);
    }
  }
  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="button-ghost"
      >
        +
      </button>

      {open && createPortal(
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
              <button
                onClick={() => setOpen(false)}
                className="button-ghost"
              >
                ✕
              </button>
            </div>
            <div className="panel-body space-y-2">
              <input
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                aria-label="Server-Adress"
                placeholder="OPC UA Server URL"
                list={savedUrl ? "savedUrls" : undefined}
                disabled={isConnected}
                className="input-ghost w-full text-left"
              />
              {savedUrl && (
                <datalist id="savedUrls">
                  <option value={savedUrl}>{savedUrl}</option>
                </datalist>
              )}
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