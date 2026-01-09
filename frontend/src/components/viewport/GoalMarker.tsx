import { useFrame } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import { useRef, useEffect, useState } from "react";
import { Mesh } from "three";

interface GoalMarkerProps {
  onPositionChange: (position: [number, number, number]) => void;
  onQuaternionChange: (quaternion: [number, number, number, number]) => void;
  onDrag: (drag: boolean) => void;
  goalPosition?: [number, number, number];
  goalQuaternion?: [number, number, number, number];
  converged?: boolean;
}

function GoalMarker({ onPositionChange, onQuaternionChange, onDrag, goalPosition, goalQuaternion, converged = true}: GoalMarkerProps) {
  const meshRef = useRef<Mesh>(null);
  const [mode, setMode] = useState<"translate" | "rotate">("translate");
  const [local , setLocal] = useState<boolean>(true);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag && ["INPUT", "TEXTAREA"].includes(tag)) return;
      if (event.key === "w" || event.key === "W") {
        setMode("translate");
      } else if (event.key === "e" || event.key === "E") {
        setMode("rotate");
      } else if (event.key === "q" || event.key === "Q") {
        setLocal(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    
    const { x, y, z } = mesh.position;
    onPositionChange([x, y, z]);

    const { x: qx, y: qy, z: qz, w: qw } = mesh.quaternion;
    onQuaternionChange([qx, qy, qz, qw]);

    meshRef.current.position.set(...goalPosition);
    meshRef.current.quaternion.set(...goalQuaternion);

  });

  const handleMouseDown = () => {
    onDrag(true);
  };

  const handleMouseUp = () => {
    onDrag(false);
  };

  return (
    <>
      <mesh ref={meshRef} position={goalPosition}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial 
          color={converged ? "#00ff00" : "#ff0000"} 
          transparent 
          opacity={0.3}
        />
      </mesh>
      <TransformControls
        object={meshRef}
        mode={mode}
        space={local ? "local" : "world"}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      />
    </>
  );
}

export default GoalMarker;