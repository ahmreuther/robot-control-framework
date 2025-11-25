import { useState } from 'react'
import './App.css'

import CornerLogo from './components/CornerLogo.tsx'
import Viewport from "./components/Viewport.tsx";

function App() {

  return (
    <>
      <div className="app-layout">
        <aside className="app-sidebar">
          <h1>Digital Twin</h1>
            <CornerLogo />
        </aside>
        <main className="app-main">
            <Viewport />
        </main>
      </div>
    </>
  )
}

export default App
