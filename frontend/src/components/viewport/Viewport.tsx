import { Canvas } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import { Suspense } from "react";
import { Html, useProgress } from "@react-three/drei";
import React from "react";
import { RobotWithIK, SOLVE_STATUS } from "./RobotIKLogic";
import { useRef } from "react";


export interface ViewportProps {
  urdfPath: string;
}

function Loader() {
    const { active, progress, errors, item, loaded, total } = useProgress()
    return <Html center className="text-4xl text-white">{progress} % loaded</Html>
}


export function Viewport(props: ViewportProps) {

  const [goalPosition, setGoalPosition] = React.useState<[number, number, number]>([0.3, 0.0, 0.3]);
  const [drag, setDrag] = React.useState<boolean>(false);
  const [goalQuaternion, setGoalQuaternion] = React.useState<[number, number, number, number]>([0, 0, 0, 1]);
  const [endEffectorReady, setEndEffectorReady] = React.useState(false);
  const [jointAngles, setJointAngles] = React.useState<number[]>([]);
  const [ikConverged, setIkConverged] = React.useState(true);
  const [solveStatuses, setSolveStatuses] = React.useState<number[]>([]);
  const statusLookup = React.useMemo(() => {
    const entries = Object.entries(SOLVE_STATUS) as Array<[keyof typeof SOLVE_STATUS, number]>;
    const lookup: Record<number, string> = {};
    entries.forEach(([label, value]) => {
      lookup[value] = label;
    });
    return lookup;
  }, []);

  const solveStatusText = solveStatuses.length
    ? solveStatuses.map((status) => statusLookup[status] ?? `UNKNOWN(${status})`).join(", ")
    : "n/a";

  const handleEndEffectorReady = React.useCallback((pos: [number, number, number], quat: [number, number, number, number]) => {
    setGoalPosition(pos);
    setGoalQuaternion(quat);
    setEndEffectorReady(true);
  }, []);
  
  const handleJointAnglesUpdate = React.useCallback((angles: number[]) => {
    setJointAngles(angles);
  }, []);
  
  const orbitRef = useRef<any>(null);
  const transformRef = useRef<any>(null);

  return (
    <div className="absolute inset-0 h-full w-full z-0 block">
      <Canvas camera={{ position: [3, 3, 3], up: [0, 0, 1], fov: 50 }}>

        <gridHelper args={[10, 10]} rotation={[Math.PI / 2, 0, 0]} />

        {/* Background color */}
        <color attach="background" args={["#202025"]} />

        {/* Lights */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <directionalLight position={[-5, 5, -5]} intensity={1.2} />

        {/* Mouse controls */}
        <OrbitControls ref={orbitRef} enabled={!drag} />

        {/* Robot with IK (includes GoalMarker) */}
        <Suspense fallback={<Loader />}>
          <RobotWithIK 
            urdfPath={props.urdfPath}
            goalPosition={goalPosition}
            goalQuaternion={goalQuaternion}
            onEndEffectorReady={handleEndEffectorReady}
            onJointAnglesUpdate={handleJointAnglesUpdate}
            onConvergedChange={setIkConverged}
            onGoalPositionChange={setGoalPosition}
            onGoalQuaternionChange={setGoalQuaternion}
            onSolveStatusesChange={setSolveStatuses}
            onDrag={setDrag}
            converged={ikConverged}
          />
        </Suspense>
      </Canvas>
      <div className="absolute top-30 left-5 text-white text-xs space-y-1">
        <div className="font-bold">Goal Position:</div>
        <div>{goalPosition.map((n) => n.toFixed(3)).join(", ")}</div>
        <div className="font-bold mt-2">Joint Angles (rad):</div>
        {jointAngles.map((angle, i) => (
          <div key={i}>J{i}: {angle.toFixed(3)}</div>
        ))}
        <div className="font-bold mt-2">IK Status:</div>
        <div>{solveStatusText}</div>
      </div>
    </div>
  );
}