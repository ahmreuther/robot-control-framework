import { useFrame } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import { useRef, useEffect } from "react";
import { Mesh } from "three";

interface GoalMarkerProps {
  onPositionChange: (position: [number, number, number]) => void;
  onDrag: (drag: boolean) => void;
  initialPosition?: [number, number, number];
  converged?: boolean;
}

function GoalMarker({ onPositionChange, onDrag, initialPosition, converged = true }: GoalMarkerProps) {
  const meshRef = useRef<Mesh>(null);
  const lastPositionRef = useRef<[number, number, number]>([0, 0, 0]);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (meshRef.current && initialPosition) {
      meshRef.current.position.set(...initialPosition);
      lastPositionRef.current = initialPosition;
    }
  }, [initialPosition]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    
    // Only update position during drag to reduce unnecessary IK calls
    if (!isDraggingRef.current) return;
    
    const { x, y, z } = mesh.position;
    
    // Only update if position actually changed
    const [lastX, lastY, lastZ] = lastPositionRef.current;
    if (Math.abs(x - lastX) > 0.001 || Math.abs(y - lastY) > 0.001 || Math.abs(z - lastZ) > 0.001) {
      lastPositionRef.current = [x, y, z];
      onPositionChange([x, y, z]);
    }
  });

  const handleMouseDown = () => {
    isDraggingRef.current = true;
    onDrag(true);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    onDrag(false);
    // Final position already emitted during drag; allow IK to revert if needed
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
        mode="translate"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      />
    </>
  );
}

export default GoalMarker;