import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { Suspense, useState, useCallback } from "react";
import { Robot } from "./Robot";
import { Stats } from "./Stats";
import { SolverStatus } from "./SolverStatus";
import type { JointStateManager } from "../../hooks/useJointState";
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { JointProperty } from "../../hooks/useSceneState";

export interface ViewportProps {
  urdfPath: string;
  jointManager: JointStateManager;
  onJointLimitsLoaded: (limits: Array<JointProperty | null>) => void;
  showCollisionMesh: boolean;
  setHoveredJointMesh?: (index: number | null) => void;
}

export function Viewport(props: ViewportProps) {
  
  const [drag, setDrag] = useState<boolean>(false);
  const [solveStatuses, setSolveStatusesState] = useState<number[]>([]);

  return (
    <div className="absolute inset-0 h-full w-full z-0 block">

      {/* Viewport Stats */}
      <div className="absolute top-0 left-0 z-50 flex flex-col gap-11">
        <Stats/>
        <SolverStatus solveStatuses={solveStatuses} />
      </div>

      <Canvas camera={{ position: [1.5, 1.0, -2.0], up: [0, 1, 0], fov: 50 }}>

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

        {/* Grid Helper */}
        <gridHelper args={[10, 10]} rotation={[0, Math.PI / 2, 0]} />

        {/* Background color */}
        <color attach="background" args={["#202025"]} />

        {/* Mouse controls */}
        <OrbitControls enabled={!drag} />

        {/* Robot with IK */}
        <Suspense fallback={null}>
          <Robot 
            urdfPath={props.urdfPath}
            drag={drag}
            onSolveStatusesChange={setSolveStatusesState}
            onDrag={setDrag}
            jointManager={props.jointManager}
            onJointLimitsLoaded={props.onJointLimitsLoaded}
            showCollisionMesh={props.showCollisionMesh}
            setHoveredJointMesh={props.setHoveredJointMesh}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}