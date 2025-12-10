import { useState } from 'react'
import './App.css'

import MessageLog from './components/MessageLog.tsx';
import { Viewport } from "./components/Viewport.tsx";
import { URDFSelector, type URDFOptions } from './components/URDFSelector.tsx';
import {Menu} from "./components/Menu.tsx";

const robotOptions: URDFOptions[] = [
  { urdf: '/urdf/eva_description/urdf/eva_description.urdf', color: '#aaaab3', label: 'EVA Automata' },
  { urdf: '/urdf/fr3_description/urdf/fr3.urdf', color: '#aaaab3', label: 'Franka Research 3' },
  { urdf: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf', color: '#aaaab3', label: 'Franka Research 3 & Wagon' },
  { urdf: '/urdf/ur5_description/urdf/ur5_robot.urdf', color: '#aaaab3', label: 'UR5e' },
];

function App() {

  const [count, setCount] = useState(0)
  
  const [selectedRobot, setSelectedRobot] = useState<URDFOptions>(robotOptions[0]); // Default to first robot(EVA Automata)

  return (
    <>
      {/* <MessageLog /> */}
      {/* <URDFSelector options={robotOptions} onSelect={setSelectedRobot} /> */}
      <Viewport urdfPath={selectedRobot.urdf} />
      <Menu />
      
    </>
  )
}

export default App
