import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useState, useCallback } from "react";
import { Robot } from "./Robot";
import { Stats } from "./Stats";

export interface ViewportProps {
  urdfPath: string;
  onJointAnglesUpdate?: (angles: number[]) => void;
  onSolveStatusesChange?: (statuses: number[]) => void;
  setFkMode?: (fkMode: boolean) => void;
  fkJointAngles: number[];
  fkMode: boolean;
}

export function Viewport(props: ViewportProps) {
  const { 
    urdfPath, 
    onJointAnglesUpdate,
    onSolveStatusesChange,
    setFkMode,
    fkJointAngles, 
    fkMode
  } = props;
  
  const [goalPosition, setGoalPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [goalQuaternion, setGoalQuaternion] = useState<[number, number, number, number]>([0, 0, 0, 1]);
  const [drag, setDrag] = useState<boolean>(false);
  const [ikConverged, setIkConverged] = useState(true);

  const handleEndEffectorReady = useCallback((pos: [number, number, number], quat: [number, number, number, number]) => {
    setGoalPosition(pos);
    setGoalQuaternion(quat);
  }, []);

  const setDragandDisableFkMode = useCallback((isDragging: boolean) => {
    setDrag(isDragging);
    if (isDragging) {
      setFkMode(false);
    }
  }, []);

  return (
    <div className="absolute inset-0 h-full w-full z-0 block">
      <Stats/>

      <Canvas camera={{ position: [1.5, 1.5, 1.5], up: [0, 0, 1], fov: 50 }}>

        <gridHelper args={[10, 10]} rotation={[Math.PI / 2, 0, 0]} />

        {/* Background color */}
        <color attach="background" args={["#202025"]} />

        {/* Lights */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <directionalLight position={[-5, 5, -5]} intensity={1.2} />

        {/* Mouse controls */}
        <OrbitControls enabled={!drag} />

        {/* Robot with IK (includes GoalMarker) */}
        <Suspense fallback={null}>
          <Robot 
            urdfPath={urdfPath}
            goalPosition={goalPosition}
            goalQuaternion={goalQuaternion}
            drag={drag}
            onEndEffectorReady={handleEndEffectorReady}
            onJointAnglesUpdate={onJointAnglesUpdate}
            onConvergedChange={setIkConverged}
            onGoalPositionChange={setGoalPosition}
            onGoalQuaternionChange={setGoalQuaternion}
            onSolveStatusesChange={onSolveStatusesChange}
            onDrag={setDragandDisableFkMode}
            converged={ikConverged}
            fkJointAngles={fkJointAngles}
            fkMode={fkMode}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}