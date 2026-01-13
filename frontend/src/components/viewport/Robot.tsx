import { useCallback, useRef, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import RobotLoader from "./RobotLoader";
import type { URDFRobot } from "urdf-loader/src/URDFClasses";
import { urdfRobotToIKRoot, setUrdfFromIK, setIKFromUrdf, Goal, Solver } from "closed-chain-ik";
import GoalMarker from "./GoalMarker";
import * as THREE from "three";
import { DragControls } from "./DragControls";
import type { JointLimit } from "../../hooks/useSceneState";
import { JointStateManager, WRITER_ID, WRITER_PRIORITY } from "../../hooks/useJointState";

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
  onSolveStatusesChange: (statuses: number[]) => void;
  onDrag: (dragging: boolean) => void;
  onJointLimitsLoaded: (limits: Array<JointLimit | null>) => void;
  jointManager: JointStateManager;
  showCollisionMesh: boolean;
}

export function Robot({
  urdfPath,
  drag,
  onSolveStatusesChange,
  onDrag,
  onJointLimitsLoaded,
  jointManager,
  showCollisionMesh,
}: RobotProps) {
  const robotRef = useRef<URDFRobot | null>(null);
  const robotGroupRef = useRef<THREE.Group | null>(null);
  
    // Store original materials for restoration
    const originalMaterialMap = useRef(new Map<THREE.Object3D, THREE.Material>());

    useEffect(() => {
      if (!robotRef.current) return;
      if (typeof showCollisionMesh === 'undefined') return;
      robotRef.current.traverse((obj: any) => {
        if (obj.geometry && obj.material) {
          if (showCollisionMesh) {
            if (!originalMaterialMap.current.has(obj)) {
              originalMaterialMap.current.set(obj, obj.material);
            }
            obj.material = new THREE.MeshPhongMaterial({
              color: 0xff4444,
              opacity: 0.3,
              transparent: true,
              wireframe: false,
            });
          } else {
            const orig = originalMaterialMap.current.get(obj);
            if (orig) {
              obj.material = orig;
            }
          }
        }
      });
      if (!showCollisionMesh) {
        originalMaterialMap.current.clear();
      }
    }, [showCollisionMesh]);
  const ikRootRef = useRef<any>(null);
  
  const convergedRef = useRef<boolean>(false);
  const solverRef = useRef<any>(null);
  const lastSolveStatusesRef = useRef<number[] | null>(null);

  const goalRef = useRef<any>(null);
  const [goalPosition, setGoalPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [goalQuaternion, setGoalQuaternion] = useState<[number, number, number, number]>([0, 0, 0, 1]);
  const lastValidGoalPositionRef = useRef<[number, number, number]>([0, 0, 0]);
  const lastValidGoalQuaternionRef = useRef<[number, number, number, number]>([0, 0, 0, 1]);

  const [localJointAngles, setLocalJointAngles] = useState<number[]>([]);
  const jointAnglesRef = useRef<number[]>([]);

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

  const [hoveredJoint, setHoveredJoint] = useState<string | null>(null);

  const hoveredJointRef = useRef<any>(null);
  const materialMapRef = useRef<Map<THREE.Object3D, THREE.Material>>(new Map());

  const [showGoalMarker, setShowGoalMarker] = useState(false);

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
      
      lastValidGoalPositionRef.current = [...newPos];
      lastValidGoalQuaternionRef.current = [...newQuat];
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        setShowGoalMarker((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const unsubscribe = jointManager.subscribe((angles) => {
      setLocalJointAngles(angles);
      jointAnglesRef.current = angles;
    });
    // Initialize local angles
    setLocalJointAngles(jointManager.getAngles());
    jointAnglesRef.current = jointManager.getAngles();
    return unsubscribe;
  }, [jointManager]);

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
    gl.domElement.style.cursor = hoveredJoint ? 'pointer' : 'default';
    return () => {
      if (gl && gl.domElement) gl.domElement.style.cursor = 'default';
    };
  }, [gl, hoveredJoint]);

  const runIK = useCallback(() => {
    const robot = robotRef.current;
    const robotGroup = robotGroupRef.current;
    const goal = goalRef.current;
    const solver = solverRef.current;
    const ikRoot = ikRootRef.current;

    // Transform goal from world space to robot local space
    const worldPos = new THREE.Vector3(...goalPosition);
    const localPos = robotGroup.worldToLocal(worldPos.clone());
    
    if(!goal) {
      goal.setPosition(localPos.x, localPos.y, localPos.z);
      goal.setQuaternion(...goalQuaternion);
      goal.setMatrixNeedsUpdate();
    }
    
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

      // Extract new angles from robot after IK solution
      const jointNames = Object.keys(robot.joints ?? {});
      const newAngles = jointNames.map((name) => robot.joints[name]?.angle ?? 0);
      jointAnglesRef.current = newAngles;

      // Update last valid goal
      lastValidGoalPositionRef.current = [...goalPosition];
      lastValidGoalQuaternionRef.current = [...goalQuaternion];

      //console.log("updating joint angles:", newAngles);
      jointManager.setAngles(WRITER_ID.IK, newAngles);
    } else if (!drag) {
      setGoalPosition([...lastValidGoalPositionRef.current]);
      setGoalQuaternion([...lastValidGoalQuaternionRef.current]);
    }
  }, [
    drag,
    goalPosition,
    goalQuaternion,
    jointAnglesRef,
    setGoalPosition,
    setGoalQuaternion,
    onSolveStatusesChange,
    jointManager
  ]);

  // Handler: robot loaded
  const handleRobotReady = useCallback(
    async (robot: URDFRobot, robotGroup: THREE.Group, jointLimits: Array<JointLimit | null>) => {
      robotRef.current = robot;
      robotGroupRef.current = robotGroup;

      onJointLimitsLoaded(jointLimits);
      
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
          jointManager.mountWriter(WRITER_ID.ANIMATION, WRITER_PRIORITY.ANIMATION);
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

      jointManager.mountWriter(WRITER_ID.RESET, WRITER_PRIORITY.RESET);
      jointManager.setAngles(WRITER_ID.RESET, jointAnglesRef.current);
      jointManager.unmountWriter(WRITER_ID.RESET);

      const robotEndEffector = findEndEffectorInRobot(robot);

      //UpdateEndEffectorPosition
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
        setGoalQuaternion(newQuat)
      }
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
    jointManager.setAngles(WRITER_ID.ANIMATION, jointAnglesRef.current);
    updateGoalToEndEffector();

    if (t >= 1.0) {
      isAnimatingRef.current = false;
      jointManager.unmountWriter(WRITER_ID.ANIMATION);
      animationStartTimeRef.current = null;
    }

    return true;
  };

  // Helper: forward kinematics
  const applyForwardKinematics = (robot: URDFRobot, jointNames: string[]) => {
    if (!robot || !localJointAngles.length) return;

    jointNames.forEach((name, index) => {
      if (index < localJointAngles.length) {
        robot.setJointValue(name, localJointAngles[index]);
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
    runIK();
    //if (drag) return;
    applyForwardKinematics(robot, jointNames);
  });

  const handleDragStart = (joint: any) => {
    jointManager.mountWriter(WRITER_ID.DRAG, WRITER_PRIORITY.DRAG);
    onDrag?.(true);
  };
  const handleDragEnd = (joint: any) => {
    jointManager.unmountWriter(WRITER_ID.DRAG);
    onDrag?.(false);
  };
  const handleHover = (joint: any) => {
    if (hoveredJointRef.current) {
      highlightJointGeometry(hoveredJointRef.current, false);
    }
    hoveredJointRef.current = joint;
    if (joint) {
      highlightJointGeometry(joint, true);
    }
    setHoveredJoint(joint?.name ?? null);
  };
  const handleUnhover = (joint: any) => {
    if (joint) {
      highlightJointGeometry(joint, false);
    }
    hoveredJointRef.current = null;
    setHoveredJoint(null);
  };

  const handleUpdateJoint = (joint: any, angle: number) => {
      const robot = robotRef.current;
      const jointNames = Object.keys(robot.joints ?? {});
      const jointIndex = jointNames.indexOf(joint.name);
      const newAngles = [...jointAnglesRef.current];
      newAngles[jointIndex] = angle;
      jointManager.setAngles(WRITER_ID.DRAG, newAngles);
    };

  return (
    <>
      <RobotLoader 
        urdfPath={urdfPath}
        onRobotReady={handleRobotReady} 
        showCollisionMesh={showCollisionMesh}
      />
      <DragControls
        robot={robotRef.current}
        camera={camera}
        domElement={gl.domElement}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onHover={handleHover}
        onUnhover={handleUnhover}
        onUpdateJoint={handleUpdateJoint}
      />
      {!isAnimatingRef.current && showGoalMarker && (
        <GoalMarker
          onPositionChange={setGoalPosition}
          onQuaternionChange={setGoalQuaternion}
          goalQuaternion={goalQuaternion}
          onDrag={onDrag}
          goalPosition={goalPosition}
          converged={convergedRef.current}
          jointManager={jointManager}
        />
      )}
    </>
  );
}