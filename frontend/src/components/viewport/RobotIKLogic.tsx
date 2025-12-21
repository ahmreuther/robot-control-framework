import { useCallback, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import RobotLoader from "./RobotLoader";
import type { URDFRobot } from "urdf-loader/src/URDFClasses";
import { urdfRobotToIKRoot, setUrdfFromIK, setIKFromUrdf, Goal, Solver } from "closed-chain-ik";
import GoalMarker from "./GoalMarker";
import * as THREE from "three";

const clonePosition = (pos: [number, number, number]) => [...pos] as [number, number, number];
const cloneQuaternion = (quat: [number, number, number, number]) => [...quat] as [number, number, number, number];

// Local copy of SOLVE_STATUS to work with isolatedModules
export const SOLVE_STATUS = {
  CONVERGED: 0,
  STALLED: 1,
  DIVERGED: 2,
  TIMEOUT: 3,
} as const;

interface RobotWithIKProps {
  urdfPath: string;
  goalPosition: [number, number, number];
  goalQuaternion: [number, number, number, number];
  onEndEffectorReady?: (position: [number, number, number], quaternion: [number, number, number, number]) => void;
  onJointAnglesUpdate?: (angles: number[]) => void;
  onConvergedChange?: (converged: boolean) => void;
  onGoalPositionChange?: (position: [number, number, number]) => void;
  onGoalQuaternionChange?: (quaternion: [number, number, number, number]) => void;
  onSolveStatusesChange?: (statuses: number[]) => void;
  onDrag?: (dragging: boolean) => void;
  converged?: boolean;
}

export function RobotWithIK({
  urdfPath,
  goalPosition,
  goalQuaternion,
  onEndEffectorReady,
  onJointAnglesUpdate,
  onConvergedChange,
  onGoalPositionChange,
  onGoalQuaternionChange,
  onSolveStatusesChange,
  onDrag,
  converged = true,
}: RobotWithIKProps) {
  const robotRef = useRef<URDFRobot | null>(null);
  const robotGroupRef = useRef<THREE.Group | null>(null);
  const ikRootRef = useRef<any>(null);
  const goalRef = useRef<any>(null);
  const solverRef = useRef<any>(null);
  const jointAnglesRef = useRef<number[]>([]);
  const initializedRef = useRef(false);
  const lastValidGoalPositionRef = useRef<[number, number, number]>([0.3, 0.0, 0.3]);
  const lastValidGoalQuaternionRef = useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const isDraggingRef = useRef(false);

  const runIK = useCallback(() => {
    const robot = robotRef.current;
    const robotGroup = robotGroupRef.current;
    const goal = goalRef.current;
    const solver = solverRef.current;
    const ikRoot = ikRootRef.current;
    
    if (!robot || !robotGroup || !goal || !solver || !ikRoot) return;

    // Transform goal from world space to robot local space
    const worldPos = new THREE.Vector3(...goalPosition);
    const localPos = robotGroup.worldToLocal(worldPos.clone());
    
    goal.setPosition(localPos.x, localPos.y, localPos.z);
    goal.setQuaternion(...goalQuaternion);
    goal.setMatrixNeedsUpdate();
    
    // Sync IK with current robot state
    setIKFromUrdf(ikRoot, robot);

    // Solve
    const statuses = solver.solve();
    if (onSolveStatusesChange) {
      onSolveStatusesChange([...statuses]);
    }
    const converged = statuses.every((status: number) => status === SOLVE_STATUS.CONVERGED);

    if (converged) {
      setUrdfFromIK(robot, ikRoot);
      robot.updateMatrixWorld(true);
      const jointNames = Object.keys(robot.joints ?? {});
      const nextAngles = jointNames.map((name) => robot.joints[name]?.angle ?? 0);
      jointAnglesRef.current = nextAngles;
      
      // Store last valid goal position
      lastValidGoalPositionRef.current = clonePosition(goalPosition);
      lastValidGoalQuaternionRef.current = cloneQuaternion(goalQuaternion);
      
      if (onJointAnglesUpdate) {
        onJointAnglesUpdate(nextAngles);
      }
      
      // Debug: Check actual end effector position
      const endEffectorNames = ["tool_point", "tool0", "tool", "ee_link", "tcp", "flange"];
      let endEffector: any = null;
      for (const name of endEffectorNames) {
        endEffector = robot.getObjectByName(name);
        if (endEffector) break;
      }
      if (!endEffector) {
        robot.traverse((obj: any) => {
          if (obj.isURDFLink) endEffector = obj;
        });
      }
      if (endEffector) {
        endEffector.updateMatrixWorld(true);
        const actualPos = new THREE.Vector3();
        endEffector.getWorldPosition(actualPos);
        const distance = actualPos.distanceTo(new THREE.Vector3(...goalPosition));
        console.log('Goal:', goalPosition);
        console.log('Actual EE:', [actualPos.x, actualPos.y, actualPos.z]);
        console.log('Distance to goal:', distance);
        console.log('Converged:', converged, 'Statuses:', statuses);
      }
    } else if (!isDraggingRef.current) {
      // IK failed to converge - reset goal to last valid position
      if (onGoalPositionChange) {
        onGoalPositionChange(clonePosition(lastValidGoalPositionRef.current));
      }
      if (onGoalQuaternionChange) {
        onGoalQuaternionChange(cloneQuaternion(lastValidGoalQuaternionRef.current));
      }
    }
    
    if (onConvergedChange) {
      onConvergedChange(converged);
    }
  }, [goalPosition, goalQuaternion, onJointAnglesUpdate, onConvergedChange, onGoalPositionChange, onGoalQuaternionChange, onSolveStatusesChange]);

  const handleRobotReady = useCallback(
    (robot: URDFRobot, robotGroup: THREE.Group) => {
      robotRef.current = robot;
      robotGroupRef.current = robotGroup;
      
      // Ensure robot is fully updated with default URDF pose
      robot.updateMatrixWorld(true);
      
      // Initialize IK root once with default robot pose
      const jointNames = Object.keys(robot.joints ?? {});
      const ikRoot = urdfRobotToIKRoot(robot, false) as any;
      ikRoot.clearDoF(); // Lock the robot base
      setIKFromUrdf(ikRoot, robot);
      ikRootRef.current = ikRoot;
      
      // Find end effector for Goal
      const endEffectorNames = ["tool_point", "tool0", "tool", "ee_link", "tcp", "flange"];
      let endEffector: any = null;
      for (const name of endEffectorNames) {
        endEffector = ikRoot.find((node: any) => node.name === name);
        if (endEffector) break;
      }
      
      if (!endEffector) {
        // Fallback to last link
        const allNodes: any[] = [];
        const traverse = (node: any) => {
          if (node) {
            allNodes.push(node);
            if (node.child) traverse(node.child);
            if (node.children) node.children.forEach((c: any) => traverse(c));
          }
        };
        traverse(ikRoot);
        endEffector = allNodes[allNodes.length - 1];
      }
      
      // Create Goal and Solver once
      const goal = new Goal();
      goal.makeClosure(endEffector);
      goalRef.current = goal;
      
      const solver = new Solver(ikRoot);
      solverRef.current = solver;
      
      jointAnglesRef.current = jointNames.map(
        (name) => robot.joints[name]?.angle ?? 0
      );
      
      if (onJointAnglesUpdate) {
        onJointAnglesUpdate(jointAnglesRef.current);
      }
      
      // Get end effector position and notify parent
      if (onEndEffectorReady) {
        const endEffectorNames = ["tool_point", "tool0", "tool", "ee_link", "tcp", "flange"];
        let endEffector: any = null;
        
        for (const name of endEffectorNames) {
          endEffector = robot.getObjectByName(name);
          if (endEffector) break;
        }
        
        if (!endEffector) {
          // Fallback to last link
          robot.traverse((obj: any) => {
            if (obj.isURDFLink) endEffector = obj;
          });
        }
        
        if (endEffector) {
          endEffector.updateMatrixWorld(true);
          const pos = new THREE.Vector3();
          const quat = new THREE.Quaternion();
          endEffector.getWorldPosition(pos);
          endEffector.getWorldQuaternion(quat);
          
          // Store initial position as last valid
          lastValidGoalPositionRef.current = [pos.x, pos.y, pos.z];
          
          const effQuat: [number, number, number, number] = [quat.x, quat.y, quat.z, quat.w];
          lastValidGoalQuaternionRef.current = cloneQuaternion(effQuat);
          onEndEffectorReady([pos.x, pos.y, pos.z], effQuat);
        }
      }
      
      // Mark as initialized - don't run IK on initial load
      initializedRef.current = true;
    },
    [onEndEffectorReady]
  );

  useEffect(() => {
    // Only run IK after initialization when goal changes
    if (initializedRef.current) {
      runIK();
    }
  }, [runIK]);

  useFrame(() => {
    const robot = robotRef.current;
    if (!robot || !jointAnglesRef.current.length) return;
    
    // Apply current joint angles to robot
    const jointNames = Object.keys(robot.joints ?? {});
    jointNames.forEach((name, index) => {
      if (index < jointAnglesRef.current.length) {
        const currentAngle = robot.joints[name]?.angle ?? 0;
        const targetAngle = jointAnglesRef.current[index];
        // Only update if different to avoid unnecessary computations
        if (Math.abs(currentAngle - targetAngle) > 0.0001) {
          robot.setJointValue(name, targetAngle);
        }
      }
    });
  });

  return (
    <>
      <RobotLoader urdfPath={urdfPath} onRobotReady={handleRobotReady} />
      {initializedRef.current && (
        <GoalMarker
          onPositionChange={onGoalPositionChange || (() => {})}
          onQuaternionChange={onGoalQuaternionChange || (() => {})}
          initialQuaternion={goalQuaternion}
          onDrag={(dragging) => {
            isDraggingRef.current = dragging;
            if (onDrag) {
              onDrag(dragging);
            }
            if (!dragging && !converged && onGoalPositionChange) {
              onGoalPositionChange(clonePosition(lastValidGoalPositionRef.current));
              if (onGoalQuaternionChange) {
                onGoalQuaternionChange(cloneQuaternion(lastValidGoalQuaternionRef.current));
              }
            }
          }}
          initialPosition={goalPosition}
          converged={converged}
        />
      )}
    </>
  );
}