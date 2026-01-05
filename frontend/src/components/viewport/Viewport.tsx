import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, useProgress } from "@react-three/drei";
import { Suspense, useState, useCallback, useMemo } from "react";
import { RobotWithIK, SOLVE_STATUS } from "./RobotIKLogic";
import { JointAnglesPanel } from "./JointAnglesPanel";

export interface ViewportProps {
  urdfPath: string;
}

function Loader() {
    const { progress } = useProgress()
    return <Html center className="text-4xl text-white">{progress} % loaded</Html>
}


export function Viewport(props: ViewportProps) {
  const [goalPosition, setGoalPosition] = useState<[number, number, number]>([0.3, 0.0, 0.3]);
  const [drag, setDrag] = useState<boolean>(false);
  const [goalQuaternion, setGoalQuaternion] = useState<[number, number, number, number]>([0, 0, 0, 1]);
  const [jointAngles, setJointAngles] = useState<number[]>([]);
  const [ikConverged, setIkConverged] = useState(true);
  const [solveStatuses, setSolveStatuses] = useState<number[]>([]);
  const [manualJointAngles, setManualJointAngles] = useState<number[]>([]);
  const [manualMode, setManualMode] = useState(true); // Start in manual mode to allow home pose to load
  
  const statusLookup = useMemo(() => {
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

  const handleEndEffectorReady = useCallback((pos: [number, number, number], quat: [number, number, number, number]) => {
    setGoalPosition(pos);
    setGoalQuaternion(quat);
  }, []);
  
  const handleJointAnglesUpdate = useCallback((angles: number[]) => {
    setJointAngles(angles);
    // Always sync manual joint angles so home pose is preserved when starting in manual mode
    setManualJointAngles(angles);
  }, []);

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
        <OrbitControls enabled={!drag} />

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
            manualJointAngles={manualJointAngles}
            manualMode={manualMode}
          />
        </Suspense>
      </Canvas>
      <JointAnglesPanel 
        jointAngles={manualJointAngles}
        manualMode={manualMode}
        onModeToggle={setManualMode}
        onAngleChange={(index, value) => {
          const newAngles = [...manualJointAngles];
          newAngles[index] = value;
          setManualJointAngles(newAngles);
          if (manualMode) {
            setJointAngles(newAngles);
          }
        }}
        onReset={() => {
          const zeros = jointAngles.map(() => 0);
          setManualJointAngles(zeros);
          if (manualMode) {
            setJointAngles(zeros);
          }
        }}
        solveStatusText={solveStatusText}
      />
    </div>
  );
}