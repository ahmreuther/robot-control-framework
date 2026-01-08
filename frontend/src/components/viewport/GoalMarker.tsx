import { useFrame } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import { useRef, useEffect, useState } from "react";
import { Mesh } from "three";

interface GoalMarkerProps {
  onPositionChange: (position: [number, number, number]) => void;
  onQuaternionChange: (quaternion: [number, number, number, number]) => void;
  onDrag: (drag: boolean) => void;
  initialPosition?: [number, number, number];
  initialQuaternion?: [number, number, number, number];
  converged?: boolean;
}

function GoalMarker({ onPositionChange, onQuaternionChange, onDrag, initialPosition, initialQuaternion, converged = true }: GoalMarkerProps) {
  const meshRef = useRef<Mesh>(null);
  const isDraggingRef = useRef(false);
  const [mode, setMode] = useState<"translate" | "rotate">("translate");

  useEffect(() => {
    if (meshRef.current && initialPosition) {
      meshRef.current.position.set(...initialPosition);
    }
  }, [initialPosition]);

  useEffect(() => {
    if (meshRef.current && initialQuaternion) {
      meshRef.current.quaternion.set(...initialQuaternion);
    }
  }, [initialQuaternion]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag && ["INPUT", "TEXTAREA"].includes(tag)) return;
      if (event.key === "w" || event.key === "W") {
        setMode("translate");
      } else if (event.key === "e" || event.key === "E") {
        setMode("rotate");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    
    if (!isDraggingRef.current) return;
    
    const { x, y, z } = mesh.position;
    onPositionChange([x, y, z]);

    const { x: qx, y: qy, z: qz, w: qw } = mesh.quaternion;
    onQuaternionChange([qx, qy, qz, qw]);
  });

  const handleMouseDown = () => {
    isDraggingRef.current = true;
    onDrag(true);
    
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    onDrag(false);
  };

  return (
    <>
      <mesh ref={meshRef} position={initialPosition}>
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
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      />
    </>
  );
}

export default GoalMarker;