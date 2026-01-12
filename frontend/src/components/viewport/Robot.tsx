import { useCallback, useRef, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import RobotLoader from "./RobotLoader";
import type { URDFRobot } from "urdf-loader/src/URDFClasses";
import { urdfRobotToIKRoot, setUrdfFromIK, setIKFromUrdf, Goal, Solver } from "closed-chain-ik";
import GoalMarker from "./GoalMarker";
import * as THREE from "three";
import { PointerURDFDragControls } from "urdf-loader/src/URDFDragControls.js";



export const SOLVE_STATUS = {
  CONVERGED: 0,
  STALLED: 1,
  DIVERGED: 2,
  TIMEOUT: 3,
} as const;

const END_EFFECTOR_NAMES = ["tool_point", "tool0", "tool", "ee_link", "tcp", "flange"];

interface RobotProps {
  urdfPath: string;
  drag: boolean;
  setJointAngles?: (angles: number[]) => void;
  onSolveStatusesChange?: (statuses: number[]) => void;
  onDrag?: (dragging: boolean) => void;
  jointAngles?: number[];
  fkMode?: boolean;
}

export function Robot({
  urdfPath,
  drag,
  setJointAngles,
  onSolveStatusesChange,
  onDrag,
  jointAngles = [],
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

  const { camera, gl } = useThree();

  const highlightMaterialRef = useRef(
    new THREE.MeshPhongMaterial({
      shininess: 10,
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.25,
    })
  );

  // Animation state for gradual home pose transition
  const animationStartTimeRef = useRef<number | null>(null);
  const animationDuration = 2.0; // seconds
  const homePositionRef = useRef<number[]>([]);
  const isAnimatingRef = useRef(false);

  // Interaction / highlighting state
  const [hoveredJoint, setHoveredJoint] = useState<string | null>(null);

  const hoveredJointRef = useRef<any>(null);
  const materialMapRef = useRef<Map<THREE.Object3D, THREE.Material>>(new Map());
  const controlsRef = useRef<any>(null);

  // Keyboard toggle (S key)
  const [sKeyPressed, setSKeyPressed] = useState<boolean>(true);
  
  const sKeyPressedRef = useRef<boolean>(true);

  // Goal marker state
  const [goalPosition, setGoalPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [goalQuaternion, setGoalQuaternion] = useState<[number, number, number, number]>([0, 0, 0, 1]);

  // Local helpers
  const findEndEffectorInRobot = (robot: URDFRobot | null) => {
    if (!robot) return null;
    for (const name of END_EFFECTOR_NAMES) {
      const candidate = robot.getObjectByName(name);
      if (candidate) return candidate;
    }
    let fallback: any = null;
    robot.traverse((obj: any) => {
      if (obj.isURDFLink) fallback = obj;
    });
    return fallback;
  };
  
  const findEndEffectorInIK = (ikRoot: any) => {
    if (!ikRoot) return null;
    for (const name of END_EFFECTOR_NAMES) {
      const candidate = ikRoot.find((node: any) => node.name === name);
      if (candidate) return candidate;
    }
    const allNodes: any[] = [];
    const traverse = (node: any) => {
      if (!node) return;
      allNodes.push(node);
      if (node.child) traverse(node.child);
      if (node.children) node.children.forEach((c: any) => traverse(c));
    };
    traverse(ikRoot);
    return allNodes[allNodes.length - 1] ?? null;
  };

  const highlightJointGeometry = (joint: any, highlight: boolean) => {
    if (!joint) return;
    const traverse = (obj: any) => {
      if (obj.type === 'Mesh') {
        if (highlight) {
          if (!materialMapRef.current.has(obj)) {
            materialMapRef.current.set(obj, obj.material);
          }
          obj.material = highlightMaterialRef.current;
        } else {
          const orig = materialMapRef.current.get(obj);
          if (orig) obj.material = orig;
        }
      }
      if (obj === joint || !obj.isURDFJoint) {
        for (const child of obj.children) {
          if (!child.isURDFCollider) traverse(child);
        }
      }
    };
    traverse(joint);
  };

  const updateGoalToEndEffector = () => {
    const robot = robotRef.current;
    if (!robot) return;
      const endEffector = findEndEffectorInRobot(robot);
    if (endEffector) {
      endEffector.updateMatrixWorld(true);
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      endEffector.getWorldPosition(pos);
      endEffector.getWorldQuaternion(quat);
      const newPos: [number, number, number] = [pos.x, pos.y, pos.z];
      const newQuat: [number, number, number, number] = [quat.x, quat.y, quat.z, quat.w];
      
      setGoalPosition(newPos);
      setGoalQuaternion(newQuat);
      
      // Also update last valid goal to prevent IK from resetting
      lastValidGoalPositionRef.current = [...newPos];
      lastValidGoalQuaternionRef.current = [...newQuat];
    }
  }

  const onDragwithAnimationLock = useCallback((isDragging: boolean) => {
    if (!isAnimatingRef.current) {
      onDrag(isDragging);
    }
  }, [isAnimatingRef, onDrag]);

  // Effects: focus and cursor
  useEffect(() => {
    if (!gl) return;
    const el = gl.domElement as HTMLElement;
    if (el.tabIndex !== 0) el.tabIndex = 0;
    const focusHandle = requestAnimationFrame(() => el.focus());
    return () => cancelAnimationFrame(focusHandle);
  }, [gl]);

  useEffect(() => {
    if (!gl) return;
    gl.domElement.style.cursor = hoveredJoint && sKeyPressed ? 'pointer' : 'default';
    return () => {
      if (gl && gl.domElement) gl.domElement.style.cursor = 'default';
    };
  }, [gl, hoveredJoint, sKeyPressed]);

  // Effects: keyboard toggle and controls enablement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setSKeyPressed((prev) => {
          const newState = !prev;
          sKeyPressedRef.current = newState;
          
          if (!newState) {
            const robot = robotRef.current;
            const ikRoot = ikRootRef.current;
            if (robot && ikRoot) {
              setIKFromUrdf(ikRoot, robot);
              const jointNames = Object.keys(robot.joints ?? {});
              jointAnglesRef.current = jointNames.map((name) => robot.joints[name]?.angle ?? 0);
            }
            updateGoalToEndEffector();
          }
          
          return newState;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = sKeyPressed;
    }
  }, [sKeyPressed]);

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
      setUrdfFromIK(robot, ikRoot);
      robot.updateMatrixWorld(true);
      const jointNames = Object.keys(robot.joints ?? {});
      const nextAngles: number[] = jointNames.map((name) => robot.joints[name]?.angle ?? 0);
      const changedAngles = nextAngles;
      jointAnglesRef.current = nextAngles;
      
      // Update last valid goal
      lastValidGoalPositionRef.current = [...goalPosition];
      lastValidGoalQuaternionRef.current = [...goalQuaternion];

      if (changedAngles && setJointAngles) {
        setJointAngles(nextAngles);
      }

    } else if (!drag) {
      setGoalPosition([...lastValidGoalPositionRef.current]);
      setGoalQuaternion([...lastValidGoalQuaternionRef.current]);
    }
  }, [
    drag,
    goalPosition,
    goalQuaternion,
    setGoalPosition,
    setGoalQuaternion,
    setJointAngles,
    onSolveStatusesChange,
  ]);

  // Handler: robot loaded
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

      // Create Goal and Solver once
      const ikEndEffector = findEndEffectorInIK(ikRoot);
      const goal = new Goal();
      goal.makeClosure(ikEndEffector);
      goalRef.current = goal;
      const solver = new Solver(ikRoot);
      solverRef.current = solver;

      jointAnglesRef.current = Object.keys(robot.joints ?? {}).map(
        (name) => robot.joints[name]?.angle ?? 0
      );
      setJointAngles(jointAnglesRef.current as number[]);

      const robotEndEffector = findEndEffectorInRobot(robot);
      if (robotEndEffector) {
        robotEndEffector.updateMatrixWorld(true);
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        robotEndEffector.getWorldPosition(pos);
        robotEndEffector.getWorldQuaternion(quat);
        const newPos: [number, number, number] = [pos.x, pos.y, pos.z];
        const newQuat: [number, number, number, number] = [quat.x, quat.y, quat.z, quat.w];
        lastValidGoalPositionRef.current = [...newPos];
        lastValidGoalQuaternionRef.current = [...newQuat];
        setGoalPosition(newPos);
        setGoalQuaternion(newQuat);
      }

      // Initialize urdf-loader pointer drag controls
      const robotObj: any = robotRef.current;
      const controls = new PointerURDFDragControls(robotObj, camera, gl.domElement);
      controlsRef.current = controls;

      controls.enabled = sKeyPressed;

      controls.updateJoint = (joint: any, angle: number) => {
        if (!sKeyPressedRef.current) return;
        
        const robot = robotRef.current;
        if (!robot) return;

        robot.setJointValue(joint.name, angle);
        robot.updateMatrixWorld(true);
        
        // Emit updated angles to parent
        const jointNames = Object.keys(robot.joints ?? {});
        const updatedAngles: number[] = jointNames.map((name) => robot.joints[name]?.angle ?? 0);
        setJointAngles?.(updatedAngles);
        updateGoalToEndEffector();
      };

      controls.onDragStart = (joint: any) => {
        if (joint && sKeyPressedRef.current) {
          onDrag?.(true);
        }
      };

      controls.onDragEnd = (joint: any) => {
        onDrag?.(false);
      };

      controls.onHover = (joint: any) => {
        if (!sKeyPressedRef.current) return;
        if (hoveredJointRef.current) {
          highlightJointGeometry(hoveredJointRef.current, false);
        }
        hoveredJointRef.current = joint;
        if (joint) {
          highlightJointGeometry(joint, true);
        }
        setHoveredJoint(joint?.name ?? null);
      };

      controls.onUnhover = (joint: any) => {
        if (joint) {
          highlightJointGeometry(joint, false);
        }
        hoveredJointRef.current = null;
        setHoveredJoint(null);
      };
    },
    [gl, camera]
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

    jointAnglesRef.current = jointNames.map((name) => robot.joints[name]?.angle ?? 0);
    setJointAngles(jointAnglesRef.current as number[]);
    updateGoalToEndEffector();

    if (t >= 1.0) {
      isAnimatingRef.current = false;
      animationStartTimeRef.current = null;
    }

    return true;
  };

  // Helper: forward kinematics
  const applyForwardKinematics = (robot: URDFRobot, jointNames: string[]) => {
    if (!robot || !jointAngles.length) return;

    jointNames.forEach((name, index) => {
      if (index < jointAngles.length) {
        robot.setJointValue(name, jointAngles[index]);
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
      if (!sKeyPressed) runIK();
      return;
    }
    if (drag) return;
    applyForwardKinematics(robot, jointNames);
  });

  return (
    <>
      <RobotLoader urdfPath={urdfPath} onRobotReady={handleRobotReady} />
      {!sKeyPressed && ( <GoalMarker
          onPositionChange={setGoalPosition}
          onQuaternionChange={setGoalQuaternion}
          goalQuaternion={goalQuaternion}
          onDrag={onDragwithAnimationLock}
          goalPosition={goalPosition}
          converged={convergedRef.current}
        />
      )}
    </>
  );
}