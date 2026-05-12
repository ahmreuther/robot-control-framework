import logoSrc from "./assets/plcm-logo.svg";
import { DesktopLayout } from "./app/layout/DesktopLayout";
import {
  createApplicationController,
  type ApplicationSnapshot,
} from "./app/model/applicationController";
import {
  WscWebSocketClient,
  type WebSocketClientStatus,
} from "./shared/api/websocketClient";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_WS_URL = "ws://127.0.0.1:8000/ws";

function createController() {
  const websocketUrl = import.meta.env.VITE_WSC2_WS_URL ?? DEFAULT_WS_URL;
  return createApplicationController({
    client: new WscWebSocketClient(websocketUrl),
  });
}

function App() {
  const controller = useMemo(() => createController(), []);
  const [snapshot, setSnapshot] = useState<ApplicationSnapshot>(controller.getSnapshot());
  const [socketStatus, setSocketStatus] = useState<WebSocketClientStatus>(
    controller.getWebSocketStatus(),
  );

  useEffect(() => {
    const unsubscribeState = controller.onStateChange(setSnapshot);
    const unsubscribeStatus = controller.onWebSocketStatus(setSocketStatus);

    return () => {
      unsubscribeStatus();
      unsubscribeState();
    };
  }, [controller]);

  return (
    <DesktopLayout
      controller={controller}
      logoSrc={logoSrc}
      snapshot={snapshot}
      socketStatus={socketStatus}
    />
  );
}

export default App;
