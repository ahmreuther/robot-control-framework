import { createContext, useState, useContext } from 'react'
import './App.css'

import Live_Status from './components/Live_Status.tsx';
import MessageLog from './components/MessageLog.tsx';
import { Viewport } from "./components/Viewport.tsx";
import { URDFSelector, type URDFOptions } from './components/URDFSelector.tsx';
import {Menu} from "./components/Menu.tsx";
import { initSocket,getSocket } from "./components/Connect";



const robotOptions: URDFOptions[] = [
  { urdf: '/urdf/eva_description/urdf/eva_description.urdf', color: '#aaaab3', label: 'EVA Automata' },
  { urdf: '/urdf/fr3_description/urdf/fr3.urdf', color: '#aaaab3', label: 'Franka Research 3' },
  { urdf: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf', color: '#aaaab3', label: 'Franka Research 3 & Wagon' },
  { urdf: '/urdf/ur5_description/urdf/ur5_robot.urdf', color: '#aaaab3', label: 'UR5e' },
];

function App() {

  const [count, setCount] = useState(0)
  
  const [selectedRobot, setSelectedRobot] = useState<URDFOptions>(robotOptions[0]); // Default to first robot(EVA Automata)

  const [logs, setLogs] = useState("test")


  const useLog = () => useContext(AppContext);

  initSocket("ws://127.0.0.1:8000/ws"); //initialize WebSocket connection

  return (
    <>
    <AppContext.Provider value={logs} >
      <Live_Status />
      <MessageLog/> 
      <URDFSelector options={robotOptions} onSelect={setSelectedRobot} />
      <Viewport urdfPath={selectedRobot.urdf} />
      <Menu />
    </AppContext.Provider>
    </>
  )
}

export const AppContext = createContext(null);

export default App
