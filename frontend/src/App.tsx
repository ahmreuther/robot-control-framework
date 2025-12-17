import { useState } from 'react'
import './App.css'

import Live_Status from './components/Live_Status';
import MessageLog from './components/MessageLog';
import { Viewport } from "./components/viewport/Viewport";
import {Menu} from "./components/Menu";
import { initSocket, getSocket } from "./components/Connect";
import { URDFSelector } from './components/URDFSelector';
import { useSceneStore } from './components/hooks/useSceneStore';


function App() {

  const [count, setCount] = useState(0)
  
  const sceneStore = useSceneStore();
  const [selectedRobot, setSelectedRobot] = useState(sceneStore.models[0]); // Default to first robot(EVA Automata)

  initSocket("ws://127.0.0.1:8000/ws"); //initialize WebSocket connection

  return (
    <>
      <Live_Status />
      <MessageLog/> 
      <URDFSelector options={sceneStore.models} onSelect={setSelectedRobot} />
      <Viewport urdfPath={selectedRobot.url} />
      <Menu />
    </>
  )
}

export default App