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
  const lastPositionRef = useRef<[number, number, number]>([0, 0, 0]);
  const lastQuaternionRef = useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const isDraggingRef = useRef(false);
  const [mode, setMode] = useState<"translate" | "rotate">("translate");

  useEffect(() => {
    if (meshRef.current && initialPosition) {
      meshRef.current.position.set(...initialPosition);
      lastPositionRef.current = initialPosition;
    }
  }, [initialPosition]);

  useEffect(() => {
    if (meshRef.current && initialQuaternion) {
      meshRef.current.quaternion.set(...initialQuaternion);
      lastQuaternionRef.current = initialQuaternion;
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
    
    // Update every frame during drag for smooth IK
    const [lastX, lastY, lastZ] = lastPositionRef.current;
    if (Math.abs(x - lastX) > 0.0001 || Math.abs(y - lastY) > 0.0001 || Math.abs(z - lastZ) > 0.0001) {
      lastPositionRef.current = [x, y, z];
      onPositionChange([x, y, z]);
    }

    const { x: qx, y: qy, z: qz, w: qw } = mesh.quaternion;
    const [lqx, lqy, lqz, lqw] = lastQuaternionRef.current;
    if (Math.abs(qx - lqx) > 0.00001 || Math.abs(qy - lqy) > 0.00001 || Math.abs(qz - lqz) > 0.00001 || Math.abs(qw - lqw) > 0.00001) {
      const nextQuat: [number, number, number, number] = [qx, qy, qz, qw];
      lastQuaternionRef.current = nextQuat;
      onQuaternionChange(nextQuat);
    }
  });

  const handleMouseDown = () => {
    isDraggingRef.current = true;
    onDrag(true);
    
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    onDrag(false);
    console.log("Mouse up");
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