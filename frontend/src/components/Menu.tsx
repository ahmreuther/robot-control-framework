import { useState } from "react";
import ConnectOPCUA from "./AddServerAndRobots/ConnectOPCUA";
import Twin_Dashboard from "./MenuComponents/TwinDashboardComponents/Twin_Dashboard";
import MessageLog from "./MenuComponents/Tab2Components/MessageLog";
import {URDFSelector, type ModelConfig } from './MenuComponents/ControlsComponents/URDFSelector';
import { JointAnglesPanel } from "./MenuComponents/ControlsComponents/JointAnglesPanel";
import { ASpaceWindow } from "./Adressspace";
import Live_Status from "./MenuComponents/TwinDashboardComponents/Live_Status";
import type { JointProperty } from "../hooks/useSceneState";
import type { JointStateManager } from "../hooks/useJointState";

interface MenuProps {
  options: ModelConfig[];
  onSelect: (robot: ModelConfig) => void;
  jointManager: JointStateManager;
  jointProperties?: Array<JointProperty | null>;
  setShowCollisionMesh?: (show: boolean) => void;
  showCollisionMesh: boolean;
  reloadKey: number;
  hoveredJointMesh?: number | null;
}

type TabKey = "Controls" | "OPC-UA" | "Twin-Dashboard";

export function SidebarMenu(MenuProps: MenuProps) {
  const [active, setActive] = useState<TabKey>("Controls");
  
  // Address Space window state - NOT persisted (always starts closed)
  const [isAddressSpaceOpen, setIsAddressSpaceOpen] = useState(false);

  const toggleAddressSpace = () => {
    setIsAddressSpaceOpen(prev => !prev);
  };

  return (
    <div className="flex h-full z-10">
      {/* Address Space Window (floating, rendered outside menu flow) */}
      <ASpaceWindow isOpen={isAddressSpaceOpen} onClose={toggleAddressSpace} />
      
      {/* SIDEBAR */}
      <aside className="flex flex-col border-r bg-black text-white">
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

          <TabButton
            active={isAddressSpaceOpen}
            onClick={toggleAddressSpace}
          >
            ASpace
          </TabButton>

        </nav>
      </aside>

      {/* CONTENT */}
      <main className="flex-1 flex flex-col overflow-y-auto p-4 bg-black space-y-4">
        {active === "Controls" && 
        <div className="space-y-4">
          <URDFSelector 
            options={MenuProps.options} 
            onSelect={MenuProps.onSelect} 
          />
          <JointAnglesPanel
            jointManager={MenuProps.jointManager}
            jointProperties={MenuProps.jointProperties}
            showCollisionMesh={MenuProps.showCollisionMesh}
            setShowCollisionMesh={MenuProps.setShowCollisionMesh}
            reloadKey={MenuProps.reloadKey}
            hoveredJointMesh={MenuProps.hoveredJointMesh}
          />
        </div>
        }
        {active === "OPC-UA" && 
        <div className="space-y-4">
          <ConnectOPCUA jointManager={MenuProps.jointManager}/> 
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