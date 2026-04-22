import { Group, Panel } from "react-resizable-panels";

import type {
  ApplicationController,
  ApplicationSnapshot,
} from "../model/applicationController";
import type { WebSocketClientStatus } from "../../shared/api/websocketClient";
import { MessageLog } from "../../features/address-space/components";
import { ResizeHandle } from "../../shared/ui/ResizeHandle";
import { RobotsServersManager } from "../../features/server-management/components";

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
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <header className="panel-header flex">
        <img
          src={logoSrc}
          alt="PLCM logo"
          className="h-10 w-auto bg-gray-200 rounded-sm p-1"
        />
        <div className="panel-title text-sm">Digital Twin Robots</div>
      </header>

      <div className="h-1 shrink-0 bg-[rgb(var(--bg-gray-200))]" />

      <Group className="min-h-0 flex-1" orientation="horizontal">
        <Panel defaultSize={82} minSize={60}>
          <Group className="h-full" orientation="vertical">
            <Panel defaultSize={68} minSize={40}>
              <Group className="h-full" orientation="horizontal">
                <Panel defaultSize={18} minSize={12}>
                  <section className="panel h-full">
                    <header className="panel-header">
                      <div className="panel-title">Joint Angles</div>
                    </header>
                  </section>
                </Panel>
                <ResizeHandle />
                <Panel defaultSize={82} minSize={50}>
                  <section className="panel h-full">
                    <header className="panel-header">
                      <div className="panel-title">Viewport</div>
                    </header>
                  </section>
                </Panel>
              </Group>
            </Panel>

            <ResizeHandle direction="horizontal" />
            <Panel defaultSize={32} minSize={20}>
              <div className="panel flex flex-col h-full">
                <header className="panel-header">
                  <div className="flex items-center gap-4">
                    <div className="panel-title">Servers:</div>
                  </div>
                </header>
                <div className="panel-body flex-1 overflow-auto">
                  <Group className="h-full" orientation="horizontal">
                    <Panel defaultSize={70} minSize={35}>
                      <section className="panel h-full">
                        <header className="panel-header">
                          <div className="panel-title">Address Space</div>
                        </header>
                      </section>
                    </Panel>
                    <ResizeHandle />
                    <Panel defaultSize={30} minSize={20}>
                      <MessageLog controller={controller} />
                    </Panel>
                  </Group>
                </div>
              </div>
            </Panel>
          </Group>
        </Panel>

        <ResizeHandle />
        <Panel defaultSize={18} minSize={14}>
          <RobotsServersManager controller={controller} snapshot={snapshot} />
        </Panel>
      </Group>
    </div>
  );
}
