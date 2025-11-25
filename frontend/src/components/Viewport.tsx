import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

function Viewport() {
  return (
    <div className="viewport">
      <Canvas
        camera={{ position: [3, 3, 3], fov: 50 }}
      >
        {/* Background color */}
        <color attach="background" args={["#202025"]} />

        {/* Lights */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />

        {/* Simple test object */}
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="orange" />
        </mesh>

        {/* Mouse controls */}
        <OrbitControls />
      </Canvas>
    </div>
  );
}

export default Viewport;