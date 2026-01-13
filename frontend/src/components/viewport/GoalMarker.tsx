import { useFrame } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import { useRef, useEffect, useState } from "react";
import { Mesh } from "three";
import { JointStateManager, WRITER_ID, WRITER_PRIORITY } from "../../hooks/useJointState";

interface GoalMarkerProps {
  onPositionChange: (position: [number, number, number]) => void;
  onQuaternionChange: (quaternion: [number, number, number, number]) => void;
  onDrag: (drag: boolean) => void;
  jointManager: JointStateManager;
  goalPosition?: [number, number, number];
  goalQuaternion?: [number, number, number, number];
  converged?: boolean;
}

function GoalMarker({
  onPositionChange,
  onQuaternionChange,
  onDrag,
  jointManager,
  goalPosition,
  goalQuaternion,
  converged = true,
}: GoalMarkerProps) {
  const meshRef = useRef<Mesh>(null);
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<[number, number, number] | null>(null);
  const lastQuatRef = useRef<[number, number, number, number] | null>(null);
  const [mode, setMode] = useState<"translate" | "rotate">("translate");
  const [local, setLocal] = useState<boolean>(false);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag && ["INPUT", "TEXTAREA"].includes(tag)) return;
      if (event.key === "w" || event.key === "W") {
        setMode("translate");
      } else if (event.key === "e" || event.key === "E") {
        setMode("rotate");
      } else if (event.key === "q" || event.key === "Q") {
        setLocal((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (!meshRef.current || !goalPosition) return;
    if (isDraggingRef.current) return;
    const [x, y, z] = goalPosition;
    meshRef.current.position.set(x, y, z);
    lastPosRef.current = goalPosition;
  }, [goalPosition]);

  useEffect(() => {
    if (!meshRef.current || !goalQuaternion) return;
    if (isDraggingRef.current) return;
    const [x, y, z, w] = goalQuaternion;
    meshRef.current.quaternion.set(x, y, z, w);
    lastQuatRef.current = goalQuaternion;
  }, [goalQuaternion]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!isDraggingRef.current) return;

    const currentPos: [number, number, number] = [mesh.position.x, mesh.position.y, mesh.position.z];
    const currentQuat: [number, number, number, number] = [
      mesh.quaternion.x,
      mesh.quaternion.y,
      mesh.quaternion.z,
      mesh.quaternion.w,
    ];

    onPositionChange(currentPos);
    lastPosRef.current = currentPos;
    onQuaternionChange(currentQuat);
    lastQuatRef.current = currentQuat;
  });

  const handleMouseDown = () => {
    isDraggingRef.current = true;
    jointManager.mountWriter(WRITER_ID.IK, WRITER_PRIORITY.IK);
    onDrag(true);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    jointManager.unmountWriter(WRITER_ID.IK);
    onDrag(false);
  };

  return (
    <>
      <mesh ref={meshRef} position={goalPosition ?? [0, 0, 0]}>
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