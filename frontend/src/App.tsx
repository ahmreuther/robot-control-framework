import { useState } from 'react'
import './App.css'

import CornerLogo from './components/CornerLogo.tsx'
import Viewport from "./components/Viewport.tsx";
import MessageLog from './components/MessageLog.tsx';

function App() {

  return (
    <>
      <CornerLogo />
      <Viewport />
      <MessageLog />
    </>
  )
}

export default App
