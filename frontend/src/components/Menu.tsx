import { useState } from "react";
import Controls from './MenuComponents/Controls'; 
import ConnectOPCUA from "./MenuComponents/Tab2Components/ConnectOPCUA";
import Twin_Dashboard from "./MenuComponents/TwinDashboardComponents/Twin_Dashboard";
import MessageLog from "./MenuComponents/Tab2Components/MessageLog";
import {URDFSelector, type ModelConfig } from './MenuComponents/ControlsComponents/URDFSelector';
import { JointAnglesPanel } from "./MenuComponents/ControlsComponents/JointAnglesPanel";
import Live_Status from "./MenuComponents/TwinDashboardComponents/Live_Status";

interface MenuProps {
  options: ModelConfig[];
  onSelect: (robot: ModelConfig) => void;
  jointAngles: number[];
  setFkMode: (enabled: boolean) => void;
  setJointAngles: (angles: number[]) => void;
}

type TabKey = "Controls" | "OPC-UA" | "Twin-Dashboard";

export function SidebarMenu(MenuProps: MenuProps) {
  const [active, setActive] = useState<TabKey>("Controls");
  return (
    <div className="flex h-screen z-10 ">
      {/* SIDEBAR */}
      <aside className="flex flex-col border-r bg-white text-gray-700">
        <nav className="flex flex-col">
          <TabButton
            active={active === "Controls"}
            onClick={() => setActive("Controls")}
          >
           Control
          </TabButton>

          <TabButton
            active={active === "OPC-UA"}
            onClick={() => setActive("OPC-UA")}
          >
            OPC_UA
          </TabButton>

          <TabButton
            active={active === "Twin-Dashboard"}
            onClick={() => setActive("Twin-Dashboard")}
          >
            Dashb
          </TabButton>
        </nav>
      </aside>

      {/* CONTENT */}
      <main className="flex overflow-y-auto p-4 max-w-md">
        {active === "Controls" && 
        <div>
          <URDFSelector 
            options={MenuProps.options} 
            onSelect={MenuProps.onSelect} 
          />
          <JointAnglesPanel
            jointAngles={MenuProps.jointAngles}
            setFkMode={MenuProps.setFkMode}
            setJointAngles={MenuProps.setJointAngles}
          />
        </div>
        }
        {active === "OPC-UA" && 
        <div>
          <ConnectOPCUA /> 
          <MessageLog /> 
        </div>}
        {active === "Twin-Dashboard" &&
        <div> 
          <Twin_Dashboard />
          <Live_Status />
        </div>}
      </main>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

//this funtion is called when chaning tabs
function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-4 py-2 text-left border-b",
        "hover:bg-red-500",
        active ? "bg-gray-200 font-medium" : "bg-transparent",
      ].join(" ")}
    >
      {children}
    </button>
  );
}