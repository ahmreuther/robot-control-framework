import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { Suspense, useState, useCallback } from "react";
import { Robot } from "./Robot";
import { Stats } from "./Stats";
import { SolverStatus } from "./SolverStatus";
import type { JointStateManager } from "../../hooks/useJointState";
import { JointManagerPanel } from "./JointManagerPanel";
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'

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

      <Canvas camera={{ position: [1.5, 1.5, -1.5], up: [0, 1, 0], fov: 50 }}>

        {/* Environment */}
       <Suspense fallback={null}> 
          <Environment 
            files={"https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/quarry_04_puresky_2k.hdr"}
            environmentIntensity={0.6}
            backgroundIntensity={0.5} 
            //ground={{ height: 5, radius: 40, scale: 20 }}
            background={true}
          />
        </Suspense>

        {/* Postprocessing Effects */}
        <EffectComposer>
          <Bloom />
          <Vignette eskil={false} offset={0.1} darkness={0.3} />
        </EffectComposer>

        <ambientLight intensity={0.4} />

        {/* Grid Helper */}
        <gridHelper args={[10, 10]} rotation={[0, Math.PI / 2, 0]} />

        {/* Background color */}
        <color attach="background" args={["#202025"]} />

        {/* Mouse controls */}
        <OrbitControls enabled={!drag} />

        {/* Robot with IK */}
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