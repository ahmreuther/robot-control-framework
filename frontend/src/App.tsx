import { useState } from 'react'
import './App.css'
import { Panel, Group } from 'react-resizable-panels'

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
  initSocket("ws://127.0.0.1:8000/ws");
  
  const [selectedRobot, setSelectedRobot] = useState(ROBOT_MODELS[0]);

  const {
    jointAngles: fkJointAngles,
    fkMode,
    setFkMode,
    setIkJoint,
    setFkJoint,
  } = useJointState();

  const handleRobotSelect = (robot: ModelConfig) => {
    setFkMode(false);
    setSelectedRobot(robot);
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#202025] text-white">
        {/* Left sidebar */}
      <Group className="">
        <Panel defaultSize="15%">
          <div className="flex flex-col gap-4 p-5 h-full bg-[#1a1a1f]">
            <URDFSelector options={ROBOT_MODELS} onSelect={handleRobotSelect} />
            <JointAnglesPanel
              jointAngles={fkJointAngles}
              fkMode={fkMode}
              setFkMode={setFkMode}
              onAngleChange={setFkJoint}
            />
          </div>
        </Panel>
        {/* Right viewport */}
        <Panel defaultSize="85%">
          <div className="relative h-full">
            <Viewport 
              urdfPath={selectedRobot.url}
              onJointAnglesUpdate={setIkJoint}
              setFkMode={setFkMode}
              fkJointAngles={fkJointAngles}
              fkMode={fkMode}
            />
          </div>
        </Panel>
      </Group>
    </div>
  )
}

export default App