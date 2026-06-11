import logoSrc from "./assets/plcm-logo.svg";
import MethodCallFeedbackBridge from "./app/components/MethodCallFeedbackBridge";
import { AppFeedbackProvider } from "./app/context/AppFeedbackContext";
import { DesktopLayout } from "./app/layout/DesktopLayout";
import {
  createApplicationController,
  type ApplicationSnapshot,
} from "./app/model/applicationController";
import { SolverConfigProvider } from "./features/viewport/context/SolverConfigContext";
import {
  WscWebSocketClient,
  type WebSocketClientStatus,
} from "./shared/api/websocketClient";
import { getWebSocketUrl } from "./shared/api/websocketUrls";
import { useEffect, useMemo, useState } from "react";

function createController() {
  return createApplicationController({
    client: new WscWebSocketClient(getWebSocketUrl()),
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
    <AppFeedbackProvider>
      <SolverConfigProvider>
        <MethodCallFeedbackBridge snapshot={snapshot} />
        <DesktopLayout
          controller={controller}
          logoSrc={logoSrc}
          snapshot={snapshot}
          socketStatus={socketStatus}
        />
      </SolverConfigProvider>
    </AppFeedbackProvider>
  );
}

export default App;
