import { useState } from "react";
import Controls from './MenuComponents/Controls'; 
import ConnectOPCUA from "./MenuComponents/ConnectOPCUA";
import Twin_Dashboard from "./MenuComponents/Twin_Dashboard";
import MessageLog from "./MenuComponents/Tab2Components/MessageLog";
import { URDFSelector, type URDFOptions } from './MenuComponents/ControlsComponents/URDFSelector';

type TabKey = "Controls" | "OPC-UA" | "Twin-Dashboard";

// props for Menu component, atm only used to pass URDF options
interface MenuProps {
  options: URDFOptions[];
  onSelect: (option: URDFOptions) => void;
}

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
      <main className="flex-1 overflow-y-auto p-4 max-w-md">
        {active === "Controls" && 
        <div className="flex flex-col items-start justify-start gap-4 ">
            <URDFSelector options={MenuProps.options} onSelect={MenuProps.onSelect} />
            <Controls />
          </div>}
        {active === "OPC-UA" && 
        <div>
          <ConnectOPCUA /> 
          <MessageLog /> 
        </div>}
        {active === "Twin-Dashboard" &&
        <div> 
          <Twin_Dashboard />
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