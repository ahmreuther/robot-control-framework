import {Tabs} from "@heroui/react";
import Controls from './Controls.tsx'; 
import ConnectOPCUA from "./ConnectOPCUA.tsx";
import Twin_Dashboard from "./Twin_Dashboard.tsx";

export function Menu() {
  return (
    <Tabs className="w-full max-w-md fixed z-10" orientation="vertical">
      <Tabs.ListContainer>
        <Tabs.List aria-label="Options">
          <Tabs.Tab id="controls">
            Controls
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="connectivity">
            OPC UA Server
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="twin_dashboards">
            Digital Twin Dashboards
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel className="pt-4" id="controls">
        <Controls />
      </Tabs.Panel>
      <Tabs.Panel className="pt-4" id="connectivity">
        <ConnectOPCUA />
      </Tabs.Panel>
      <Tabs.Panel className="pt-4" id="twin_dashboards">
        <Twin_Dashboard />
      </Tabs.Panel>
    </Tabs>
  );
}