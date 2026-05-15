import { Group, Panel } from "react-resizable-panels";

import type {
  ApplicationController,
  ApplicationSnapshot,
} from "../model/applicationController";
import type { WebSocketClientStatus } from "../../shared/api/websocketClient";
import {
  AddressSpaceTree,
  MessageLog,
  NodeDetailsPanel,
  ServerManager,
} from "../../features/opcua-server/components";
import { OpcuaServerProvider } from "../../features/opcua-server/context/OpcuaServerContext";
import {
  Viewport,
  ViewportSettingsButton,
} from "../../features/viewport/components";
import { useViewportSceneState } from "../../features/viewport/model/sceneState";
import { ResizeHandle } from "../../shared/ui/ResizeHandle";
import JointAnglesPanel from "../../features/robot-control/components/JointAnglesPanel";
import { RobotInteractionProvider } from "../../features/robot-control/context/RobotInteractionContext";
import RobotManager from "../../features/robot-control/components/RobotManager";
import { RobotControlProvider } from "../../features/robot-control/context/RobotControlContext";

export interface DesktopLayoutProps {
  controller: ApplicationController;
  logoSrc: string;
  snapshot: ApplicationSnapshot;
  socketStatus: WebSocketClientStatus;
}

export function DesktopLayout({
  controller,
  logoSrc,
  snapshot,
  socketStatus,
}: DesktopLayoutProps) {
  const viewportScene = useViewportSceneState();
  const activeAddressSpaceServer = snapshot.server.activeServerUrl
    ? shortServerName(snapshot.server.activeServerUrl)
    : "";
  const activeRobotName = snapshot.robot.activeRobotId
    ? (snapshot.robot.byId[snapshot.robot.activeRobotId]?.displayName ?? "")
    : "";

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <header className="panel-header flex">
        <a
          href="https://www.maschinenbau.tu-darmstadt.de/plcm/fachgebiet_plcm/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open PLCM website"
        >
          <img
            src={logoSrc}
            alt="PLCM logo"
            className="h-10 w-auto bg-gray-200 rounded-sm p-1"
          />
        </a>
        <div className="panel-title text-sm">Digital Twin Robots</div>
      </header>

      <RobotControlProvider controller={controller} snapshot={snapshot}>
        <RobotInteractionProvider>
          <OpcuaServerProvider controller={controller} snapshot={snapshot}>
            <div className="panel-body flex h-screen w-full flex-col overflow-hidden">
            <Group className="min-h-0 flex-1" orientation="horizontal">
              <Panel defaultSize={82} minSize={60}>
                <Group className="h-full" orientation="vertical">
                  <Panel defaultSize={68} minSize={40}>
                    <Group className="h-full" orientation="horizontal">
                      <Panel defaultSize={18} minSize={12}>
                        <section className="panel h-full overflow-auto">
                          <header className="panel-header">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="panel-title">Robot</div>
                              <div className="truncate text-xs text-[rgb(var(--fg-muted))]">
                                {activeRobotName}
                              </div>
                            </div>
                          </header>
                          <JointAnglesPanel />
                        </section>
                      </Panel>
                      <ResizeHandle />
                      <Panel defaultSize={82} minSize={50}>
                        <section className="panel h-full flex flex-col">
                          <header className="panel-header">
                            <div className="panel-title">Viewport</div>
                            <ViewportSettingsButton
                              sceneState={viewportScene}
                            />
                          </header>
                          <div className="min-h-0 flex-1">
                            <Viewport sceneState={viewportScene} />
                          </div>
                        </section>
                      </Panel>
                    </Group>
                  </Panel>

                  <ResizeHandle direction="horizontal" />
                  <Panel defaultSize={32} minSize={20}>
                    <Group className="h-full" orientation="horizontal">
                      <Panel defaultSize={70} minSize={35}>
                        <section className="panel h-full flex flex-col">
                          <header className="panel-header">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="panel-title">Address Space</div>
                              <div className="truncate text-xs text-[rgb(var(--fg-muted))]">
                                {activeAddressSpaceServer}
                              </div>
                            </div>
                            <button
                              className="button-ghost"
                              disabled={!snapshot.server.activeServerUrl}
                              onClick={() => {
                                if (!snapshot.server.activeServerUrl) return;
                                controller.browseAddressSpaceRoot(
                                  snapshot.server.activeServerUrl,
                                );
                              }}
                            >
                              Reload
                            </button>
                          </header>
                          <Group
                            className="min-h-0 flex-1"
                            orientation="horizontal"
                          >
                            <Panel defaultSize={35} minSize={20}>
                              <AddressSpaceTree />
                            </Panel>
                            <ResizeHandle />
                            <Panel defaultSize={65} minSize={40}>
                              <NodeDetailsPanel />
                            </Panel>
                          </Group>
                        </section>
                      </Panel>
                      <ResizeHandle />
                      <Panel defaultSize={30} minSize={20}>
                        <MessageLog />
                      </Panel>
                    </Group>
                  </Panel>
                </Group>
              </Panel>

              <ResizeHandle />
              <Panel defaultSize={18} minSize={14}>
                <div className="flex h-full flex-col gap-2 overflow-auto">
                  <ServerManager />
                  <RobotManager />
                </div>
              </Panel>
            </Group>
            </div>
          </OpcuaServerProvider>
        </RobotInteractionProvider>
      </RobotControlProvider>
    </div>
  );
}

function shortServerName(serverUrl: string): string {
  return serverUrl.replace("opc.tcp://", "").replace("/freeopcua/server/", "");
}
