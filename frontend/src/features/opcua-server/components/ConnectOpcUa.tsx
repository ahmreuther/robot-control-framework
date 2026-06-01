import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useAppFeedback } from "../../../app/context/AppFeedbackContext";
import { useOpcuaServer } from "../context/OpcuaServerContext";

const defaultUrls = [
  "opc.tcp://127.0.0.1:4840/freeopcua/server/",
  "opc.tcp://10.10.38.25:4840/freeopcua/server/",
  "opc.tcp://10.10.38.26:4840/freeopcua/server/",
  "opc.tcp://10.10.38.27:4840/freeopcua/server/",
  "opc.tcp://10.10.38.28:4840/freeopcua/server/",
];

function ConnectOpcUa() {
  const { connectServer, discoverRobots, snapshot } = useOpcuaServer();
  const feedback = useAppFeedback();
  const lastUrl = localStorage.getItem("lastOpcUaUrl");
  const initialSavedUrls =
    lastUrl && !defaultUrls.includes(lastUrl)
      ? [...defaultUrls, lastUrl]
      : defaultUrls;

  const [open, setOpen] = useState(false);
  const [savedUrls] = useState<string[]>(initialSavedUrls);
  const [localUrl, setLocalUrl] = useState("");
  const [pendingServerUrl, setPendingServerUrl] = useState<string | null>(null);

  const pendingServer = useMemo(
    () =>
      pendingServerUrl ? snapshot.server.byUrl[pendingServerUrl] ?? null : null,
    [pendingServerUrl, snapshot.server.byUrl],
  );

  useEffect(() => {
    if (!pendingServerUrl || !pendingServer) {
      return;
    }

    feedback.hideLoading(`server.connect.${pendingServerUrl}`);
    feedback.showSuccess(
      `Connected to ${pendingServerUrl.replace("opc.tcp://", "")}`,
    );
    setPendingServerUrl(null);
  }, [feedback, pendingServer, pendingServerUrl]);

  useEffect(() => {
    if (!pendingServerUrl) {
      return;
    }

    const matchingError = [...snapshot.server.errors]
      .reverse()
      .find((error) => error.serverUrl === pendingServerUrl);

    if (!matchingError) {
      return;
    }

    feedback.hideLoading(`server.connect.${pendingServerUrl}`);
    feedback.showError("Failed to connect server", {
      description: matchingError.message,
      key: `server.connect.${pendingServerUrl}`,
    });
    setPendingServerUrl(null);
  }, [feedback, pendingServerUrl, snapshot.server.errors]);

  function handleConnect() {
    const trimmedUrl = localUrl.trim();
    if (trimmedUrl) {
      localStorage.setItem("lastOpcUaUrl", trimmedUrl);
      setPendingServerUrl(trimmedUrl);
      feedback.showLoading(
        `server.connect.${trimmedUrl}`,
        `Connecting to ${trimmedUrl.replace("opc.tcp://", "")}`,
      );
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
