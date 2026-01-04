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
  manualJointAngles?: number[];
  manualMode?: boolean;
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
  manualJointAngles = [],
  manualMode = false,
}: RobotWithIKProps) {
  const robotRef = useRef<URDFRobot | null>(null);
  const robotGroupRef = useRef<THREE.Group | null>(null);
  const ikRootRef = useRef<any>(null);
  const goalRef = useRef<any>(null);
  const solverRef = useRef<any>(null);
  const jointAnglesRef = useRef<number[]>([]);
  const initializedRef = useRef(false);
  const isInitialSetupRef = useRef(true);
  const lastValidGoalPositionRef = useRef<[number, number, number]>([0.3, 0.0, 0.3]);
  const lastValidGoalQuaternionRef = useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const isDraggingRef = useRef(false);
  
  // Animation state for gradual home pose transition
  const animationStartTimeRef = useRef<number | null>(null);
  const animationDuration = 2.0; // seconds
  const homePositionRef = useRef<number[]>([]);
  const isAnimatingRef = useRef(false);

  const runIK = useCallback(() => {
    const robot = robotRef.current;
    const robotGroup = robotGroupRef.current;
    const goal = goalRef.current;
    const solver = solverRef.current;
    const ikRoot = ikRootRef.current;
    
    if (!robot || !robotGroup || !goal || !solver || !ikRoot) return;
    
    // Skip IK during initial setup
    if (isInitialSetupRef.current) return;

    // Transform goal from world space to robot local space
    const worldPos = new THREE.Vector3(...goalPosition);
    const localPos = robotGroup.worldToLocal(worldPos.clone());
    
    goal.setPosition(localPos.x, localPos.y, localPos.z);
    goal.setQuaternion(...goalQuaternion);
    goal.setMatrixNeedsUpdate();
    
    // Always sync IK with current robot state before solving
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
    async (robot: URDFRobot, robotGroup: THREE.Group) => {
      robotRef.current = robot;
      robotGroupRef.current = robotGroup;
      
      // Load home pose from configuration
      try {
        const response = await fetch('/urdf/home_poses.json');
        const homePosesConfig = await response.json();
        
        const robotName = (robot.robotName || robot.name || '').toLowerCase();
        let configKey = '';
        
        if (robotName.includes('eva_description')) configKey = 'eva_description';
        else if (robotName.includes('ur5')) configKey = 'ur5';
        else if (robotName.includes('fr3')) configKey = 'fr3';
        
        if (configKey && homePosesConfig[configKey]) {
          const config = homePosesConfig[configKey];
          const jointNames = Object.keys(robot.joints ?? {});
          const degToRad = (deg: number) => (deg * Math.PI) / 180;
          
          // Store home position for animation (don't apply immediately)
          const homeAngles: number[] = [];
          config.homePosition.forEach((value: number, index: number) => {
            if (index < jointNames.length) {
              const angle = config.homePositionDegrees ? degToRad(value) : value;
              homeAngles.push(angle);
            }
          });
          homePositionRef.current = homeAngles;
          
          // Start robot at zero and animate to home pose
          jointNames.forEach((name) => {
            robot.setJointValue(name, 0);
          });
          
          // Start animation
          animationStartTimeRef.current = performance.now();
          isAnimatingRef.current = true;
        }
      } catch (error) {
        console.warn('Could not load home poses config:', error);
      }
      
      // Ensure robot is fully updated with home pose
      robot.updateMatrixWorld(true);
      
      // Initialize IK root once with home pose
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
          
          // Now that we know the actual end effector position, enable IK solving
          isInitialSetupRef.current = false;
        }
      }
      
      // Mark as initialized - don't run IK on initial load
      initializedRef.current = true;
    },
    [onEndEffectorReady]
  );

  useEffect(() => {
    // When switching from manual to IK mode, sync IK with current robot state
    if (!manualMode && ikRootRef.current && robotRef.current && !isInitialSetupRef.current) {
      setIKFromUrdf(ikRootRef.current, robotRef.current);
    }
  }, [manualMode]);

  useEffect(() => {
    // Only run IK after initialization and after endeffector is ready (skip initial setup)
    if (initializedRef.current && !isInitialSetupRef.current && !manualMode) {
      runIK();
    }
  }, [runIK, manualMode]);

  useFrame(() => {
    const robot = robotRef.current;
    if (!robot || !jointAnglesRef.current.length) return;
    
    const jointNames = Object.keys(robot.joints ?? {});
    
    // Handle animation from zero to home pose
    if (isAnimatingRef.current && animationStartTimeRef.current !== null) {
      const elapsed = (performance.now() - animationStartTimeRef.current) / 1000;
      const t = Math.min(elapsed / animationDuration, 1.0);
      
      // Smooth easing function (ease-in-out)
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      
      jointNames.forEach((name, index) => {
        if (index < homePositionRef.current.length) {
          const startAngle = 0;
          const targetAngle = homePositionRef.current[index];
          const currentAngle = startAngle + (targetAngle - startAngle) * eased;
          robot.setJointValue(name, currentAngle);
        }
      });
      robot.updateMatrixWorld(true);
      
      // Update joint angles
      jointAnglesRef.current = jointNames.map((name) => robot.joints[name]?.angle ?? 0);
      if (onJointAnglesUpdate) {
        onJointAnglesUpdate(jointAnglesRef.current);
      }
      
      // Update goal position to follow end effector during animation
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
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        endEffector.getWorldPosition(pos);
        endEffector.getWorldQuaternion(quat);
        if (onGoalPositionChange) {
          onGoalPositionChange([pos.x, pos.y, pos.z]);
        }
        if (onGoalQuaternionChange) {
          onGoalQuaternionChange([quat.x, quat.y, quat.z, quat.w]);
        }
      }
      
      // Animation complete
      if (t >= 1.0) {
        isAnimatingRef.current = false;
        animationStartTimeRef.current = null;
        // Now ready for IK solving
        isInitialSetupRef.current = false;
      }
      
      return;
    }
    
    if (manualMode && manualJointAngles.length > 0) {
      // Forward kinematics: apply manual angles directly
      jointNames.forEach((name, index) => {
        if (index < manualJointAngles.length) {
          robot.setJointValue(name, manualJointAngles[index]);
        }
      });
      robot.updateMatrixWorld(true);
      
      // Update goal position based on end effector
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
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        endEffector.getWorldPosition(pos);
        endEffector.getWorldQuaternion(quat);
        if (onGoalPositionChange) {
          onGoalPositionChange([pos.x, pos.y, pos.z]);
        }
        if (onGoalQuaternionChange) {
          onGoalQuaternionChange([quat.x, quat.y, quat.z, quat.w]);
        }
      }
    } else {
      // IK mode: apply angles from solver
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
    }
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