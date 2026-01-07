import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, useProgress } from "@react-three/drei";
import { Suspense, useState, useCallback } from "react";
import { Robot } from "./Robot";

export interface ViewportProps {
  urdfPath: string;
  onJointAnglesUpdate?: (angles: number[]) => void;
  onSolveStatusesChange?: (statuses: number[]) => void;
  onTransformDrag?: () => void;
  fkJointAngles: number[];
  fkMode: boolean;
  onFkModeChange: (mode: boolean) => void;
  onFkJointAnglesChange: (angles: number[]) => void;
}

function Loader() {
    const { progress } = useProgress()
    return <Html center className="text-4xl text-white">{progress} % loaded</Html>
}


export function Viewport(props: ViewportProps) {
  const { 
    urdfPath, 
    onJointAnglesUpdate,
    onSolveStatusesChange,
    onTransformDrag,
    fkJointAngles, 
    fkMode,
    onFkModeChange,
    onFkJointAnglesChange
  } = props;
  
  const [goalPosition, setGoalPosition] = useState<[number, number, number]>([0.3, 0.0, 0.3]);
  const [drag, setDrag] = useState<boolean>(false);
  const [goalQuaternion, setGoalQuaternion] = useState<[number, number, number, number]>([0, 0, 0, 1]);
  const [ikConverged, setIkConverged] = useState(true);

  const handleEndEffectorReady = useCallback((pos: [number, number, number], quat: [number, number, number, number]) => {
    setGoalPosition(pos);
    setGoalQuaternion(quat);
  }, []);
  
  const handleJointAnglesUpdate = useCallback((angles: number[]) => {
    if (onJointAnglesUpdate) onJointAnglesUpdate(angles);
  }, [onJointAnglesUpdate]);

  return (
    <div className="absolute inset-0 h-full w-full z-0 block">
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
        <Suspense fallback={<Loader />}>
          <Robot 
            urdfPath={urdfPath}
            goalPosition={goalPosition}
            goalQuaternion={goalQuaternion}
            onEndEffectorReady={handleEndEffectorReady}
            onJointAnglesUpdate={handleJointAnglesUpdate}
            onConvergedChange={setIkConverged}
            onGoalPositionChange={setGoalPosition}
            onGoalQuaternionChange={setGoalQuaternion}
            onSolveStatusesChange={onSolveStatusesChange}
            onDrag={(dragging) => {
              setDrag(dragging);
              if (dragging && onTransformDrag) {
                onTransformDrag();
              }
            }}
            converged={ikConverged}
            manualJointAngles={fkJointAngles}
            manualMode={fkMode}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}