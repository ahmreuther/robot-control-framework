import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useState, useCallback } from "react";
import { Robot } from "./Robot";
import { Stats } from "./Stats";
import { SolverStatus } from "./SolverStatus";
import type { JointStateManager } from "../../hooks/useJointState";
import { JointManagerPanel } from "./JointManagerPanel";

export interface ViewportProps {
  urdfPath: string;
  jointManager: JointStateManager;
  onJointLimitsLoaded: (limits: Array<import("../../hooks/useSceneState").JointLimit | null>) => void;
  showCollisionMesh: boolean;
}

export function Viewport(props: ViewportProps) {
  const { 
    urdfPath,
    jointManager,
    onJointLimitsLoaded
  } = props;
  
  const [drag, setDrag] = useState<boolean>(false);
  const [solveStatuses, setSolveStatusesState] = useState<number[]>([]);

  return (
    <div className="absolute inset-0 h-full w-full z-0 block">

      {/* Viewport Stats */}
      <div className="absolute top-0 left-0 z-50 flex flex-col gap-11">
        <Stats/>
        <SolverStatus solveStatuses={solveStatuses} />
      </div>
      <div className="absolute top-0 right-0 m-4 z-50">
        <JointManagerPanel jointManager={jointManager} />
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
            onSolveStatusesChange={setSolveStatusesState}
            onDrag={setDrag}
            jointManager={jointManager}
            onJointLimitsLoaded={onJointLimitsLoaded}
            showCollisionMesh={props.showCollisionMesh}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}