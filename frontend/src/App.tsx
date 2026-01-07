import { useState, useMemo } from 'react'
import './App.css'

import { Viewport } from "./components/viewport/Viewport";
import { initSocket } from "./components/Connect";
import { SOLVE_STATUS } from './components/viewport/Robot';
import { URDFSelector, type ModelConfig } from './components/URDFSelector';
import { JointAnglesPanel } from "./components/viewport/JointAnglesPanel";

const ROBOT_MODELS: ModelConfig[] = [
  { id: 'eva', label: 'EVA Automata', url: '/urdf/eva_description/urdf/eva_description.urdf' },
  { id: 'fr3', label: 'Franka Research 3', url: '/urdf/fr3_description/urdf/fr3.urdf' },
  { id: 'fr3_wagon', label: 'Franka Research 3 with Wagon', url: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf' },
  { id: 'ur5e', label: 'UR5e', url: '/urdf/ur5_description/urdf/ur5_robot.urdf' },
];

type sceneState = 'loading' | 'fk' | 'ik';

function App() {
  const [selectedRobot, setSelectedRobot] = useState(ROBOT_MODELS[0]); // Default to first robot(EVA Automata)

  const [sceneState, setSceneState] = useState<sceneState | null>(null);

  //Robot state
  const [fkMode, setFkMode] = useState(false);
  const [fkJointAngles, setFkJointAngles] = useState<number[]>([]);

  const [solveStatuses, setSolveStatuses] = useState<number[]>([]);

  initSocket("ws://127.0.0.1:8000/ws"); //initialize WebSocket connection

  const statusLookup = useMemo(() => {
    const entries = Object.entries(SOLVE_STATUS) as Array<[keyof typeof SOLVE_STATUS, number]>;
    const lookup: Record<number, string> = {};
    entries.forEach(([label, value]) => {
      lookup[value] = label;
    });
    return lookup;
  }, []);

  const solveStatusText = solveStatuses.length
    ? solveStatuses.map((status) => statusLookup[status] ?? `UNKNOWN(${status})`).join(", ")
    : "n/a";

  const handleJointAnglesUpdate = (angles: number[]) => {
    if (!fkMode) {
      setFkJointAngles(angles);
    }
  };

  const handleTransformDrag = () => {
    if (fkMode) {
      setFkMode(false);
    }
  };

  const handleRobotSelect = (robot: ModelConfig) => {
    setSelectedRobot(robot);
  };

  return (
    <>
      <div className="relative w-screen h-screen overflow-hidden bg-[#202025] text-white">
        {/* <Live_Status /> */}
        {/* <MessageLog/>  */}
        <Viewport 
          urdfPath={selectedRobot.url}
          onJointAnglesUpdate={handleJointAnglesUpdate}
          onSolveStatusesChange={setSolveStatuses}
          onTransformDrag={handleTransformDrag}
          fkJointAngles={fkJointAngles}
          fkMode={fkMode}
        />
        <div className="absolute top-5 left-5 pointer-events-none">
          <URDFSelector options={ROBOT_MODELS} onSelect={handleRobotSelect} />
        </div>
        <div className="absolute top-5 right-5 pointer-events-none">
          <JointAnglesPanel
            jointAngles={fkJointAngles}
            manualMode={fkMode}
            onModeToggle={(enabled) => setFkMode(enabled)}
            onAngleChange={(index, value) => {
              if (!fkMode) setFkMode(true);
              const newAngles = [...fkJointAngles];
              newAngles[index] = value;
              setFkJointAngles(newAngles);
            }}
            solveStatusText={solveStatusText}
          />
        </div>
        {/* <Menu /> */}
      </div>
    </>
  )
}

export default App