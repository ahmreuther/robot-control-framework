import { useState } from "react";
import { createPortal } from "react-dom";

import { useOpcuaServer } from "../context/OpcuaServerContext";

const defaultUrls = [
  "opc.tcp://127.0.0.1:4840/freeopcua/server/",
  "opc.tcp://10.10.38.25:4840/freeopcua/server/",
  "opc.tcp://10.10.38.26:4840/freeopcua/server/",
  "opc.tcp://10.10.38.27:4840/freeopcua/server/",
  "opc.tcp://10.10.38.28:4840/freeopcua/server/",
];

function ConnectOpcUa() {
  const { connectServer, discoverRobots } = useOpcuaServer();
  const lastUrl = localStorage.getItem("lastOpcUaUrl");
  const initialSavedUrls =
    lastUrl && !defaultUrls.includes(lastUrl)
      ? [...defaultUrls, lastUrl]
      : defaultUrls;

  const [open, setOpen] = useState(false);
  const [savedUrls] = useState<string[]>(initialSavedUrls);
  const [localUrl, setLocalUrl] = useState("");

  function handleConnect() {
    const trimmedUrl = localUrl.trim();
    if (trimmedUrl) {
      localStorage.setItem("lastOpcUaUrl", trimmedUrl);
      connectServer(trimmedUrl);
      discoverRobots(trimmedUrl);
      setLocalUrl("");
    }
    setOpen(false);
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
              className="panel z-50 w-[min(92vw,560px)] flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel-header">
                <div className="panel-title">OPCUA Connect</div>
                <button onClick={() => setOpen(false)} className="button-ghost">
                  ✕
                </button>
              </div>
              <div className="panel-body flex flex-col gap-2">
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
                <button onClick={handleConnect} className="button-ghost">
                  Connect Server
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
