import { useCallback, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import RobotLoader from "./RobotLoader";
import type { URDFRobot } from "urdf-loader/src/URDFClasses";
import { urdfRobotToIKRoot, setUrdfFromIK, setIKFromUrdf, Goal, Solver } from "closed-chain-ik";
import GoalMarker from "./GoalMarker";
import * as THREE from "three";
import { is } from "@react-three/fiber/dist/declarations/src/core/utils";

const clonePosition = (pos: [number, number, number]) => [...pos] as [number, number, number];
const cloneQuaternion = (quat: [number, number, number, number]) => [...quat] as [number, number, number, number];
const isSameVec3 = (a: [number, number, number], b: [number, number, number], eps = 1e-5) =>
  Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;
const isSameQuat = (a: [number, number, number, number], b: [number, number, number, number], eps = 1e-5) =>
  Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps && Math.abs(a[3] - b[3]) < eps;
const isSameAngles = (a: number[], b: number[], eps = 1e-5) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < eps);

export const SOLVE_STATUS = {
  CONVERGED: 0,
  STALLED: 1,
  DIVERGED: 2,
  TIMEOUT: 3,
} as const;

interface RobotProps {
  urdfPath: string;
  drag: boolean;
  onJointAnglesUpdate?: (angles: number[]) => void;
  onSolveStatusesChange?: (statuses: number[]) => void;
  onDrag?: (dragging: boolean) => void;
  onFailureCountChange?: (count: number) => void;
  fkJointAngles?: number[];
  fkMode?: boolean;
}

export function Robot({
  urdfPath,
  drag,
  onJointAnglesUpdate,
  onSolveStatusesChange,
  onDrag,
  onFailureCountChange,
  fkJointAngles = [],
  fkMode = false,
}: RobotProps) {
  const robotRef = useRef<URDFRobot | null>(null);
  const robotGroupRef = useRef<THREE.Group | null>(null);
  const ikRootRef = useRef<any>(null);
  const goalRef = useRef<any>(null);
  const solverRef = useRef<any>(null);
  const jointAnglesRef = useRef<number[]>([]);
  const lastSolveStatusesRef = useRef<number[] | null>(null);
  const lastValidGoalPositionRef = useRef<[number, number, number]>([0, 0, 0]);
  const lastValidGoalQuaternionRef = useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const convergedRef = useRef<boolean>(false);
  const failureCountRef = useRef<number>(0);

  //GoalMarker state todo exchange with useRef for performance
  const [goalPosition, setGoalPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [goalQuaternion, setGoalQuaternion] = useState<[number, number, number, number]>([0, 0, 0, 1]);

  const setGoalPositionSafe = useCallback((pos: [number, number, number]) => {
    setGoalPosition((prev) => (isSameVec3(prev, pos) ? prev : pos));
  }, []);

  const setGoalQuaternionSafe = useCallback((quat: [number, number, number, number]) => {
    setGoalQuaternion((prev) => (isSameQuat(prev, quat) ? prev : quat));
  }, []);
  
  // Animation state for gradual home pose transition
  const animationStartTimeRef = useRef<number | null>(null);
  const animationDuration = 2.0; // seconds
  const homePositionRef = useRef<number[]>([]);
  const isAnimatingRef = useRef(false);

  const onDragwithAnimationLock = useCallback((isDragging: boolean) => {
    if (!isAnimatingRef.current) {
      onDrag(isDragging);
    }
  }, [isAnimatingRef, onDrag]);

  const updateGoalToEndEffector = () => {
    const robot = robotRef.current;
    if (!robot) return;
    
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
      const newPos: [number, number, number] = [pos.x, pos.y, pos.z];
      const newQuat: [number, number, number, number] = [quat.x, quat.y, quat.z, quat.w];
      setGoalPositionSafe(newPos);
      setGoalQuaternionSafe(newQuat);
    }
  }

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
    
    // Always sync IK with current robot state before solving
    setIKFromUrdf(ikRoot, robot);

    // Solve
    const statuses = solver.solve();

    const statusesArr = [...statuses];
    const sameStatuses = lastSolveStatusesRef.current && statusesArr.length === lastSolveStatusesRef.current.length && statusesArr.every((v, i) => v === lastSolveStatusesRef.current![i]);
    if (!sameStatuses) {
      lastSolveStatusesRef.current = statusesArr;
      onSolveStatusesChange?.(statusesArr);
    }

    convergedRef.current = statuses.every((status: number) => status === SOLVE_STATUS.CONVERGED);

    if (convergedRef.current) {
      failureCountRef.current = 0;
      onFailureCountChange?.(0);
      setUrdfFromIK(robot, ikRoot);
      robot.updateMatrixWorld(true);
      const jointNames = Object.keys(robot.joints ?? {});
      const nextAngles: number[] = jointNames.map((name) => robot.joints[name]?.angle ?? 0);
      const changedAngles = !isSameAngles(jointAnglesRef.current, nextAngles);
      jointAnglesRef.current = nextAngles;
      
      // Update last valid goal
      lastValidGoalPositionRef.current = clonePosition(goalPosition);
      lastValidGoalQuaternionRef.current = cloneQuaternion(goalQuaternion);

      if (changedAngles && onJointAnglesUpdate) {
        onJointAnglesUpdate(nextAngles);
      }

    } else if (!drag) {
      // Require a few consecutive failures before resetting to avoid flicker
      failureCountRef.current += 1;
      onFailureCountChange?.(failureCountRef.current);
      if (failureCountRef.current >= 3) {
        setGoalPositionSafe(clonePosition(lastValidGoalPositionRef.current));
        setGoalQuaternionSafe(cloneQuaternion(lastValidGoalQuaternionRef.current));
        failureCountRef.current = 0;
        onFailureCountChange?.(0);
      }
    }
  }, [
    drag,
    goalPosition,
    goalQuaternion,
    setGoalPosition,
    setGoalQuaternion,
    onJointAnglesUpdate,
    onSolveStatusesChange,
    onFailureCountChange,
    setGoalPositionSafe,
    setGoalQuaternionSafe
  ]);

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
          
          // Start animation - enable FK mode
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

      const endEffectorNames = ["tool_point", "tool0", "tool", "ee_link", "tcp", "flange"];
      let endEffector: any = null;
      
      // Find end effector for Goal
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
      
      onJointAnglesUpdate(jointAnglesRef.current as number[]);
       
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
        const newPos: [number, number, number] = [pos.x, pos.y, pos.z];
        const newQuat: [number, number, number, number] = [quat.x, quat.y, quat.z, quat.w];
        
        lastValidGoalPositionRef.current = clonePosition(newPos);
        lastValidGoalQuaternionRef.current = cloneQuaternion(newQuat);
        setGoalPositionSafe(newPos);
        setGoalQuaternionSafe(newQuat);
      }
    },
    [setGoalPositionSafe, setGoalQuaternionSafe]
  );  

  // Helper: animate from zero to home pose during startup
  const applyHomeAnimation = (robot: URDFRobot, jointNames: string[]) => {
    if (!robot || animationStartTimeRef.current === null) return false;
    const elapsed = (performance.now() - animationStartTimeRef.current) / 1000;
    const t = Math.min(elapsed / animationDuration, 1.0);
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
    onJointAnglesUpdate(jointAnglesRef.current as number[]);

    updateGoalToEndEffector();

    if (t >= 1.0) {
      isAnimatingRef.current = false;
      animationStartTimeRef.current = null;
    }

    return true;
  };

  // Helper: apply solver angles (IK mode)
  const applyInverseKinematics = (robot: URDFRobot, jointNames: string[]) => {
    if (!robot || !jointAnglesRef.current.length) return;

    jointNames.forEach((name, index) => {
      if (index < jointAnglesRef.current.length) {
        const currentAngle = robot.joints[name]?.angle ?? 0;
        const targetAngle = jointAnglesRef.current[index];
        if (Math.abs(currentAngle - targetAngle) > 0.0001) {
          robot.setJointValue(name, targetAngle);
        }
      }
    });
  };

  // Helper: forward kinematics (manual mode)
  const applyForwardKinematics = (robot: URDFRobot, jointNames: string[]) => {
    if (!robot || !fkJointAngles.length) return;

    jointNames.forEach((name, index) => {
      if (index < fkJointAngles.length) {
        robot.setJointValue(name, fkJointAngles[index]);
      }
    });
    robot.updateMatrixWorld(true);

    updateGoalToEndEffector();
  };

  useFrame(() => {
    const robot = robotRef.current;
    if (!robot) return;
    const jointNames = Object.keys(robot.joints ?? {});
    if (!jointNames.length) return;

    if (isAnimatingRef.current && animationStartTimeRef.current !== null) {
      if (applyHomeAnimation(robot, jointNames)) return;
    }

    if (!fkMode) {
      runIK();
      return;
    }

    if (fkMode) {
      applyForwardKinematics(robot, jointNames);
    } else {
      applyInverseKinematics(robot, jointNames);
    }
  });

  return (
    <>
      <RobotLoader urdfPath={urdfPath} onRobotReady={handleRobotReady} />
      <GoalMarker
        onPositionChange={setGoalPosition}
        onQuaternionChange={setGoalQuaternion}
        goalQuaternion={goalQuaternion}
        onDrag={onDragwithAnimationLock}
        goalPosition={goalPosition}
        converged={convergedRef.current}
      />
    </>
  );
}