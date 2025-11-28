import { useState } from 'react'
import './App.css'

import CornerLogo from './components/CornerLogo.tsx'
import { Viewport } from "./components/Viewport.tsx";
import { URDFSelector, type URDFOptions } from './components/URDFSelector.tsx';

const robotOptions: URDFOptions[] = [
  { urdf: '/urdf/eva_description/urdf/eva_description.urdf', color: '#aaaab3', label: 'EVA Automata' },
  { urdf: '/urdf/fr3_description/urdf/fr3.urdf', color: '#aaaab3', label: 'Franka Research 3' },
  { urdf: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf', color: '#aaaab3', label: 'Franka Research 3 & Wagon' },
  { urdf: '/urdf/ur5_description/urdf/ur5_robot.urdf', color: '#aaaab3', label: 'UR5e' },
];

export const App: React.FC = () => {

  const [selectedRobot, setSelectedRobot] = useState<URDFOptions>(robotOptions[0]); // Default to first robot(EVA Automata)

  return (
    <>
      <URDFSelector options={robotOptions} onSelect={setSelectedRobot} />
      <Viewport urdfPath={selectedRobot.urdf} />
    </>
  )
};

export default App
