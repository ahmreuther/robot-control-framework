import { useState, useCallback } from 'react'
import './App.css'

import { Viewport } from "./components/viewport/Viewport";
import { initSocket } from "./components/Connect";
import { URDFSelector, type ModelConfig } from './components/URDFSelector';
import { JointAnglesPanel } from "./components/viewport/JointAnglesPanel";
import { useJointState } from "./components/hooks/useJointState";

const ROBOT_MODELS: ModelConfig[] = [
  { id: 'eva', label: 'EVA Automata', url: '/urdf/eva_description/urdf/eva_description.urdf' },
  { id: 'fr3', label: 'Franka Research 3', url: '/urdf/fr3_description/urdf/fr3.urdf' },
  { id: 'fr3_wagon', label: 'Franka Research 3 with Wagon', url: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf' },
  { id: 'ur5e', label: 'UR5e', url: '/urdf/ur5_description/urdf/ur5_robot.urdf' },
];

function App() {

  initSocket("ws://127.0.0.1:8000/ws"); //initialize WebSocket connection
  
  const [selectedRobot, setSelectedRobot] = useState(ROBOT_MODELS[0]); // Default to first robot(EVA Automata)

  // Joint state and solve status are centralized in this hook
  const {
    jointAngles: fkJointAngles,
    fkMode,
    setFkMode,
    setIkJoint,
    setFkJoint,
    setSolveStatuses,
    solveStatusText,
  } = useJointState();

  const handleRobotSelect = (robot: ModelConfig) => {
    setFkMode(false);
    setSelectedRobot(robot);
  };

  return (
    <>
      <div className="relative w-screen h-screen overflow-hidden bg-[#202025] text-white">
        {/* <Live_Status /> */}
        {/* <MessageLog/>  */}
        <Viewport 
          urdfPath={selectedRobot.url}
          onJointAnglesUpdate={setIkJoint}
          onSolveStatusesChange={setSolveStatuses}
          setFkMode={setFkMode}
          fkJointAngles={fkJointAngles}
          fkMode={fkMode}
        />
        <div className="absolute top-5 left-5 pointer-events-none">
          <URDFSelector options={ROBOT_MODELS} onSelect={handleRobotSelect} />
        </div>
        <div className="absolute top-5 right-5 pointer-events-none">
          <JointAnglesPanel
            jointAngles={fkJointAngles}
            fkMode={fkMode}
            onModeToggle={setFkMode}
            onAngleChange={setFkJoint}
            solveStatusText={solveStatusText}
          />
        </div>
        {/* <Menu /> */}
      </div>
    </>
  )
}

export default App