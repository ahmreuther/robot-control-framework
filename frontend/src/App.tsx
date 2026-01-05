import { useState } from 'react'
import './App.css'

import Live_Status from './components/Live_Status';
import MessageLog from './components/MessageLog';
import { Viewport } from "./components/viewport/Viewport";
import {Menu} from "./components/Menu";
import { initSocket, getSocket } from "./components/Connect";
import { URDFSelector } from './components/URDFSelector';

const ROBOT_MODELS = [
  { id: 'eva', label: 'EVA Automata', url: '/urdf/eva_description/urdf/eva_description.urdf' },
  { id: 'fr3', label: 'Franka Research 3', url: '/urdf/fr3_description/urdf/fr3.urdf' },
  { id: 'fr3_wagon', label: 'Franka Research 3 with Wagon', url: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf' },
  { id: 'ur5e', label: 'UR5e', url: '/urdf/ur5_description/urdf/ur5_robot.urdf' },
];

function App() {

  const [count, setCount] = useState(0)
  
  const [selectedRobot, setSelectedRobot] = useState(ROBOT_MODELS[0]); // Default to first robot(EVA Automata)

  initSocket("ws://127.0.0.1:8000/ws"); //initialize WebSocket connection

  return (
    <>
      {/* <Live_Status /> */}
      {/* <MessageLog/>  */}
      <URDFSelector options={ROBOT_MODELS} onSelect={setSelectedRobot} />
      <Viewport urdfPath={selectedRobot.url} />
      {/* <Menu /> */}
    </>
  )
}

export default App