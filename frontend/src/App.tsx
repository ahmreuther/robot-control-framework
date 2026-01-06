import { useState } from 'react'
import './App.css'

import Live_Status from './components/Live_Status';
import { Viewport } from "./components/Viewport";
import {type URDFOptions } from './components/URDFSelector';
import { initSocket } from "./components/Connect";
import { SidebarMenu } from './components/Menu';

const robotOptions: URDFOptions[] = [
  { urdf: '/urdf/eva_description/urdf/eva_description.urdf', color: '#aaaab3', label: 'EVA Automata' },
  { urdf: '/urdf/fr3_description/urdf/fr3.urdf', color: '#aaaab3', label: 'Franka Research 3' },
  { urdf: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf', color: '#aaaab3', label: 'Franka Research 3 & Wagon' },
  { urdf: '/urdf/ur5_description/urdf/ur5_robot.urdf', color: '#aaaab3', label: 'UR5e' },
];

function App() {
  
  const [selectedRobot, setSelectedRobot] = useState<URDFOptions>(robotOptions[0]); // Default to first robot(EVA Automata)

  initSocket("ws://127.0.0.1:8000/ws"); //initialize WebSocket connection

  return (
    <div className="h-screen flex">
      <SidebarMenu options={robotOptions} onSelect={setSelectedRobot} />
      <Live_Status />
      <Viewport urdfPath={selectedRobot.urdf} />
    </div>
  )
}

export default App
