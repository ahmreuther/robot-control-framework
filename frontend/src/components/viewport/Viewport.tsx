import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useState, useCallback } from "react";
import { Robot } from "./Robot";
import { Stats } from "./Stats";
import { SolverStatus } from "./SolverStatus";

export interface ViewportProps {
  urdfPath: string;
  setJointAngles: (angles: number[]) => void;
  setFkMode: (fkMode: boolean) => void;
  jointAngles: number[];
  fkMode: boolean;
  onJointLimitsLoaded?: (limits: Array<import("../../hooks/useSceneState").JointLimit | null>) => void;
}

export function Viewport(props: ViewportProps) {
  const { 
    urdfPath, 
    setJointAngles,
    setFkMode,
    jointAngles, 
    fkMode,
    onJointLimitsLoaded
  } = props;
  
  const [drag, setDrag] = useState<boolean>(false);
  const [solveStatuses, setSolveStatusesState] = useState<number[]>([]);

  const setDragandDisableFkMode = useCallback((isDragging: boolean) => {
    setDrag(isDragging);
    if (isDragging) {
      setFkMode(false);
    }
  }, [setDrag, setFkMode]);

  return (
    <div className="absolute inset-0 h-full w-full z-0 block">

      {/* Viewport Stats */}
      <div className="absolute top-0 left-0 z-50 flex flex-col gap-11">
        <Stats/>
        <SolverStatus solveStatuses={solveStatuses} />
      </div>

      <Canvas camera={{ position: [1.5, 1.5, 1.5], up: [0, 0, 1], fov: 50 }}>

        {/* Grid Helper */}
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
            drag={drag}
            setJointAngles={setJointAngles}
            onSolveStatusesChange={setSolveStatusesState}
            onDrag={setDragandDisableFkMode}
            jointAngles={jointAngles}
            fkMode={fkMode}
            onJointLimitsLoaded={onJointLimitsLoaded}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}