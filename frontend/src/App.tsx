import { useState } from 'react'

import Live_Status from './components/Live_Status';
import MessageLog from './components/MessageLog';
import { Viewport } from "./components/Viewport";
import { URDFSelector, type URDFOptions } from './components/URDFSelector';


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
        <div className="live-status"><Live_Status /></div>
      <MessageLog />
      <URDFSelector options={robotOptions} onSelect={setSelectedRobot} />
      <Viewport urdfPath={selectedRobot.urdf} />
    </>
  )
};

export default App
