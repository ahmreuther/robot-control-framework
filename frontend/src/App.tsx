import { useState, useMemo } from 'react'
import './App.css'

import Live_Status from './components/Live_Status';
import MessageLog from './components/MessageLog';
import { Viewport } from "./components/viewport/Viewport";
import {Menu} from "./components/Menu";
import { initSocket, getSocket } from "./components/Connect";
import { SOLVE_STATUS } from './components/viewport/Robot';
import type { ModelConfig } from './components/URDFSelector';

const ROBOT_MODELS: ModelConfig[] = [
  { id: 'eva', label: 'EVA Automata', url: '/urdf/eva_description/urdf/eva_description.urdf' },
  { id: 'fr3', label: 'Franka Research 3', url: '/urdf/fr3_description/urdf/fr3.urdf' },
  { id: 'fr3_wagon', label: 'Franka Research 3 with Wagon', url: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf' },
  { id: 'ur5e', label: 'UR5e', url: '/urdf/ur5_description/urdf/ur5_robot.urdf' },
];

function App() {

  const [count, setCount] = useState(0)
  
  const [selectedRobot, setSelectedRobot] = useState(ROBOT_MODELS[0]); // Default to first robot(EVA Automata)
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
    setFkJointAngles(angles);
  };

  const handleFkJointAnglesChange = (angles: number[]) => {
    if (!fkMode) setFkMode(true); // Auto-enable FK mode when dragging sliders
    setFkJointAngles(angles);
  };

  const handleReset = () => {
    if (!fkMode) setFkMode(true); // Auto-enable FK mode for reset
    setFkJointAngles(new Array(fkJointAngles.length).fill(0));
  };

  const handleTransformDrag = () => {
    if (fkMode) setFkMode(false); // Auto-enable IK mode when dragging goal marker
  };

  return (
    <>
      {/* <Live_Status /> */}
      {/* <MessageLog/>  */}
      <Viewport 
        urdfPath={selectedRobot.url}
        onJointAnglesUpdate={handleJointAnglesUpdate}
        onSolveStatusesChange={setSolveStatuses}
        onTransformDrag={handleTransformDrag}
        fkJointAngles={fkJointAngles}
        fkMode={fkMode}
        onFkModeChange={setFkMode}
        onFkJointAnglesChange={handleFkJointAnglesChange}
        onReset={handleReset}
        solveStatusText={solveStatusText}
        robotModels={ROBOT_MODELS}
        onRobotSelect={setSelectedRobot}
      />
      {/* <Menu /> */}
    </>
  )
}

export default App