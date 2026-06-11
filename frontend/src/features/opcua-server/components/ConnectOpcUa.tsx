import { useEffect, useState } from "react";
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
  const { connectServer, controller, discoverRobots } = useOpcuaServer();
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
  const [pendingDiscoveryRequestId, setPendingDiscoveryRequestId] = useState<
    string | null
  >(null);

  useEffect(() => {
    return controller.onWebSocketMessageLog((entry) => {
      if (entry.direction !== "incoming" || !pendingServerUrl) {
        return;
      }

      const message = entry.message;
      const trimmedLabel = pendingServerUrl.replace("opc.tcp://", "");

      if (
        message.type === "serverConnected" &&
        message.server.serverUrl === pendingServerUrl
      ) {
        feedback.hideLoading(`server.connect.${pendingServerUrl}`);
        feedback.showLoading(
          `server.discover.${pendingServerUrl}`,
          `Discovering robots and actions from ${trimmedLabel}`,
        );
        return;
      }

      if (
        message.type === "robotsDiscovered" &&
        message.serverUrl === pendingServerUrl &&
        (!pendingDiscoveryRequestId ||
          !message.requestId ||
          message.requestId === pendingDiscoveryRequestId)
      ) {
        feedback.hideLoading(`server.connect.${pendingServerUrl}`);
        feedback.hideLoading(`server.discover.${pendingServerUrl}`);
        feedback.showSuccess(
          `Discovered ${message.robots.length} robot(s) from ${trimmedLabel}`,
        );
        setPendingServerUrl(null);
        setPendingDiscoveryRequestId(null);
        return;
      }

      if (message.type === "error" && message.serverUrl === pendingServerUrl) {
        feedback.hideLoading(`server.connect.${pendingServerUrl}`);
        feedback.hideLoading(`server.discover.${pendingServerUrl}`);
        feedback.showError("Failed to discover server capabilities", {
          description: message.message,
          key: `server.connect.${pendingServerUrl}`,
        });
        setPendingServerUrl(null);
        setPendingDiscoveryRequestId(null);
      }
    });
  }, [controller, feedback, pendingDiscoveryRequestId, pendingServerUrl]);

  function handleConnect() {
    const trimmedUrl = localUrl.trim();
    if (trimmedUrl) {
      localStorage.setItem("lastOpcUaUrl", trimmedUrl);
      setPendingServerUrl(trimmedUrl);
      setPendingDiscoveryRequestId(null);
      feedback.showLoading(
        `server.connect.${trimmedUrl}`,
        `Connecting to ${trimmedUrl.replace("opc.tcp://", "")}`,
      );
      connectServer(trimmedUrl);
      setPendingDiscoveryRequestId(discoverRobots(trimmedUrl));
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
