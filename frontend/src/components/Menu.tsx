import { useState } from "react";
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
    <div className="flex h-screen z-10">
      {/* SIDEBAR */}
      <aside className="flex flex-col border-r bg-black bg-opacity-80 text-white">
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
            OPC-UA
          </TabButton>

          <TabButton
            active={active === "Twin-Dashboard"}
            onClick={() => setActive("Twin-Dashboard")}
          >
            Dashboard
          </TabButton>
        </nav>
      </aside>

      {/* CONTENT */}
      <main className="flex flex-col overflow-y-auto p-4 max-w-md bg-black bg-opacity-50 space-y-4">
        {active === "Controls" && 
        <div className="space-y-4">
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
        <div className="space-y-4">
          <ConnectOPCUA /> 
          <MessageLog /> 
        </div>}
        {active === "Twin-Dashboard" &&
        <div className="space-y-4"> 
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
        "px-4 py-2 text-left border border-white/20 text-sm font-medium transition-colors",
        "hover:bg-white/10",
        active ? "bg-white/20 text-white" : "bg-transparent text-white/70",
      ].join(" ")}
    >
      {children}
    </button>
  );
}