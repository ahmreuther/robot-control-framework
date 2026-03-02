import { useFrame, useThree } from '@react-three/fiber';
import { Goal, setIKFromUrdf, setUrdfFromIK, Solver, urdfRobotToIKRoot } from 'closed-chain-ik';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { URDFJoint, URDFLink } from 'urdf-loader/src/URDFClasses';
import { type URDFRobot } from 'urdf-loader/src/URDFClasses';

import type { JointStateManager } from '../../hooks/useJointState';
import { WRITER_ID, WRITER_PRIORITY } from '../../hooks/useJointState';
import type { JointProperty } from '../../hooks/useSceneState';
import { DragControls } from './DragControls';
import GoalMarker from './GoalMarker';
import RobotLoader from './RobotLoader';
import { useRobotInfoContext } from '../../contexts/RobotInfoContext';
import { useSolverConfig } from '../../contexts/useSolverConfigContext';
import { useSyncContext } from '../../contexts/SyncContext';
import { useSendMessage } from '../../hooks/send-message';
import MessageController from './MessageController';

export const SOLVE_STATUS = {
  CONVERGED: 0,
  STALLED: 1,
  DIVERGED: 2,
  TIMEOUT: 3,
} as const;

const END_EFFECTOR_NAMES = ['tool_point', 'tool0', 'tool', 'ee_link', 'tcp', 'flange'];

interface RobotProps {
  urdfPath: string;
  drag: boolean;
  onSolveStatusesChange: (statuses: number[]) => void;
  onDrag: (dragging: boolean) => void;
  onJointLimitsLoaded: (limits: (JointProperty | null)[]) => void;
  jointManager: JointStateManager;
  showCollisionMesh: boolean;
  setHoveredJointMesh?: (index: number | null) => void;
  setMovedDistance?: (distance: number) => void;
  pendingJoints: number[];
  setPendingJoints: (joints: number[] | null) => void;
}

export function Robot({
  urdfPath,
  drag,
  onSolveStatusesChange,
  onDrag,
  onJointLimitsLoaded,
  jointManager,
  showCollisionMesh,
  setHoveredJointMesh,
  setMovedDistance,
  pendingJoints,
  setPendingJoints,
}: RobotProps) {
  const { isSyncActive } = useSyncContext();
  const { sendMessage } = useSendMessage();
  const { config: solverConfig } = useSolverConfig();
  const { setOrderedJointNames } = useRobotInfoContext();
  const robotRef = useRef<URDFRobot>(null);
  const getOrderedRevoluteJointNames = (robot: URDFRobot): string[] => {
    if (!robot?.joints) return [];

    let currentJoint: URDFJoint | null = null;
    for (const child of robot.children) {
      if (child.type === 'URDFJoint') {
        currentJoint = child as URDFJoint;
        break;
      }
    }

    const ordered: string[] = [];
    while (currentJoint) {
      const jointName = currentJoint.name;
      const jointObj = robot.joints[jointName];
      if (jointObj && (jointObj.jointType === 'revolute' || jointObj.jointType === 'continuous')) {
        ordered.push(jointName);
      }

      let nextJoint: URDFJoint | null = null;
      if (currentJoint.children?.length) {
        const urdfLink = currentJoint.children.find((c) => c.type === 'URDFLink') as URDFLink;
        if (urdfLink?.children) {
          nextJoint = (urdfLink.children.find((c) => c.type === 'URDFJoint') as URDFJoint) || null;
        }
      }
      currentJoint = nextJoint;
    }

    return ordered;
  };
  const robotGroupRef = useRef<THREE.Group>(null);

  // IK state
  const ikRootRef = useRef<any>(null);
  const convergedRef = useRef<boolean>(false);
  const solverRef = useRef<Solver>(null);
  const lastSolveStatusesRef = useRef<number[] | null>(null);

  // GoalMarker state
  const goalRef = useRef<any>(null);
  const [goalPosition, setGoalPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [goalQuaternion, setGoalQuaternion] = useState<[number, number, number, number]>([
    0, 0, 0, 1,
  ]);
  const lastValidGoalPositionRef = useRef<[number, number, number]>([0, 0, 0]);
  const lastValidGoalQuaternionRef = useRef<[number, number, number, number]>([0, 0, 0, 1]);

  const [localJointAngles, setLocalJointAngles] = useState<number[]>([]);
  const jointAnglesRef = useRef<number[]>([]);

  const { camera, gl } = useThree();

  const originalMaterialMapRef = useRef<Map<THREE.Object3D, THREE.Material>>(new Map()); // Store original materials

  const collisionMaterialRef = useRef(
    new THREE.MeshPhysicalMaterial({
      color: 0x880000,
      metalness: 0.2,
      roughness: 0.7,
      transparent: true,
      opacity: 0.7,
    }),
  );

  // Animation state for gradual home pose transition
  const animationStartTimeRef = useRef<number | null>(null);
  const animationDuration = 2.0; // seconds
  const homePositionRef = useRef<number[]>([]);
  const isAnimatingRef = useRef(false);

  const hoveredJointRef = useRef<URDFJoint>(null);

  const [showGoalMarker, setShowGoalMarker] = useState(false);

  useEffect(() => {
    if (!robotRef.current) return;
    robotRef.current.traverse((obj: any) => {
      if (obj.isMesh && typeof obj.name === 'string') {
        const name = obj.name.toLowerCase();
        if (showCollisionMesh && name.startsWith('collision_')) {
          originalMaterialMapRef.current.set(obj, obj.material);
          obj.material = collisionMaterialRef.current;
        } else if (!showCollisionMesh && name.startsWith('collision_')) {
          obj.material = originalMaterialMapRef.current.get(obj);
        }
      }
    });
    if (!showCollisionMesh) {
      originalMaterialMapRef.current.clear();
    }
  }, [showCollisionMesh]);

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
    setLocalJointAngles(jointManager.getAngles());
    jointAnglesRef.current = jointManager.getAngles();
    return unsubscribe;
  }, [jointManager]);

  // Main loop
  useFrame(() => {
    const robot = robotRef.current;
    if (!robot) return;
    const jointNames = Object.keys(robot.joints ?? {});
    if (!jointNames.length) return;

    homeAnimation(jointNames);
    runIK();
    applyJointAngles(robot, jointNames);
  });

  const runIK = useCallback(() => {
    const robot = robotRef.current; // robot copy for trying solving IK
    const robotGroup = robotGroupRef.current;
    const goal = goalRef.current;
    const solver = solverRef.current;
    const ikRoot = ikRootRef.current;
    if (!robot || !robotGroup || !goal || !solver || !ikRoot) return;

    // Transform goal from world space to robot local space
    const worldPos = new THREE.Vector3(...goalPosition);
    const worldQuat = new THREE.Quaternion(...goalQuaternion);
    const localPos = robotGroup.worldToLocal(worldPos.clone());
    const robotGroupWorldQuat = robotGroup.getWorldQuaternion(new THREE.Quaternion());
    const localQuat = worldQuat.clone().premultiply(robotGroupWorldQuat.invert());
    if (goal) {
      goal.setPosition(localPos.x, localPos.y, localPos.z);
      goal.setQuaternion(localQuat.x, localQuat.y, localQuat.z, localQuat.w);
      //goal.setQuaternion(...goalQuaternion); // makes ik smoother but breaks some functionality
      goal.setMatrixNeedsUpdate();
    }

    // Always sync IK with current robot state before solving
    setIKFromUrdf(ikRoot, robot);

    const statuses = solver.solve();

    // set solve statuses
    const statusesArr = [...statuses];
    const sameStatuses =
      statusesArr.length === lastSolveStatusesRef.current?.length &&
      statusesArr.every((v, i) => v === lastSolveStatusesRef.current![i]);
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
    jointManager,
  ]);

  // Handler: robot loaded
  const handleRobotReady = useCallback(
    async (robot: URDFRobot, robotGroup: THREE.Group) => {
      robotRef.current = robot;
      robotGroupRef.current = robotGroup;
      robotGroup.rotation.x = -Math.PI / 2;

      const ordered = getOrderedRevoluteJointNames(robot);
      setOrderedJointNames(ordered);
      // console.log('[Robot] Ordered joint names:', ordered);

      const jointNames = Object.keys(robot.joints ?? {});
      jointManager.setJointNames(jointNames);

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
          const degToRad = (deg: number) => (deg * Math.PI) / 180;
          const homeAngles: number[] = [];
          config.homePosition.forEach((value: number, index: number) => {
            if (index < jointNames.length) {
              const angle = config.homePositionDegrees ? degToRad(value) : value;
              homeAngles.push(angle);
            }
          });
          homePositionRef.current = homeAngles;
          animationStartTimeRef.current = performance.now();
          isAnimatingRef.current = true;
          jointManager.mountWriter(WRITER_ID.ANIMATION, WRITER_PRIORITY.ANIMATION);
        }
      } catch (error) {
        console.warn('Could not load home poses config:', error);
      }

      // Extract joint limits and notify parent
      const jointLimits: (JointProperty | null)[] = [];
      if (robot.joints) {
        Object.values(robot.joints).forEach((joint) => {
          const limit = joint.limit;
          if (limit) {
            const jointType = joint.jointType || 'revolute';
            let min = limit.lower;
            let max = limit.upper;
            if (jointType === 'prismatic') {
              min = min ?? 0;
              max = max ?? 1;
            } else {
              min = min ?? -Math.PI;
              max = max ?? Math.PI;
            }
            jointLimits.push({
              min,
              max,

              jointType,
            });
          } else {
            jointLimits.push(null);
          }
        });
      }
      onJointLimitsLoaded(jointLimits);

      // Process robot meshes for better appearance and hide collision meshes
      robot.traverse((obj: THREE.Object3D) => {
        if (obj.type === 'Mesh' && (obj as THREE.Mesh).material && typeof obj.name === 'string') {
          const mesh = obj as THREE.Mesh;
          const name = mesh.name.toLowerCase();
          if (name.startsWith('collision_')) {
            mesh.material = new THREE.MeshPhysicalMaterial({
              transparent: true,
              opacity: 0,
            });
          } else {
            const origColor = (mesh.material as any).color
              ? (mesh.material as any).color.getHex()
              : 0xffffff;
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: origColor,
              metalness: 0.5,
              roughness: 0.6,
              clearcoat: 0.2,
              clearcoatRoughness: 0.3,
              reflectivity: 0.3,
              envMapIntensity: 0,
              // emissive: 0xa67c00,
              // emissiveIntensity: 5.0,
            });
          }
        }
      });
      // After assigning new materials, clear and rebuild the originalMaterialMapRef
      originalMaterialMapRef.current.clear();
      robot.traverse((obj: THREE.Object3D) => {
        if (obj.type === 'Mesh' && (obj as THREE.Mesh).material) {
          const material = (obj as THREE.Mesh).material;
          if (Array.isArray(material)) {
            if (material[0]) {
              originalMaterialMapRef.current.set(obj, material[0]);
            }
          } else {
            originalMaterialMapRef.current.set(obj, material);
          }
        }
      });

      // Initialize IK
      const ikRoot = urdfRobotToIKRoot(robot, false) as any;
      ikRoot.clearDoF(); // Lock the robot base
      setIKFromUrdf(ikRoot, robot);
      ikRootRef.current = ikRoot;
      const ikEndEffector = findEndEffectorInIK(ikRoot);
      const goal = new Goal();
      goal.makeClosure(ikEndEffector);
      goalRef.current = goal;
      const solver = new Solver(ikRoot);

      // Apply solver configuration from context
      solver.useSVD = solverConfig.useSVD;
      solver.maxIterations = solverConfig.maxIterations;
      solver.stallThreshold = solverConfig.stallThreshold;
      solver.dampingFactor = solverConfig.dampingFactor;
      solver.divergeThreshold = solverConfig.divergeThreshold;
      solver.restPoseFactor = solverConfig.restPoseFactor;
      solver.translationConvergeThreshold = solverConfig.translationConvergeThreshold;
      solver.rotationConvergeThreshold = solverConfig.rotationConvergeThreshold;
      solver.translationFactor = solverConfig.translationFactor;
      solver.rotationFactor = solverConfig.rotationFactor;
      solver.translationStep = solverConfig.translationStep;
      solver.rotationStep = solverConfig.rotationStep;
      solver.translationErrorClamp = solverConfig.translationErrorClamp;
      solver.rotationErrorClamp = solverConfig.rotationErrorClamp;

      solverRef.current = solver;
    },
    [jointManager, onJointLimitsLoaded, setOrderedJointNames],
  );

  // Animation: home position
  const homeAnimation = (jointNames: string[]) => {
    if (animationStartTimeRef.current === null) return false;
    const elapsed = (performance.now() - animationStartTimeRef.current) / 1000;
    const t = Math.min(elapsed / animationDuration, 1.0);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const newAngles = jointNames.map((_, index) => {
      if (index < homePositionRef.current.length) {
        const startAngle = 0;
        const targetAngle = homePositionRef.current[index] ?? 0;
        return startAngle + (targetAngle - startAngle) * eased;
      }
      return 0;
    });
    jointManager.setAngles(WRITER_ID.ANIMATION, newAngles);
    updateGoalToEndEffector();
    if (t >= 1.0) {
      isAnimatingRef.current = false;
      jointManager.unmountWriter(WRITER_ID.ANIMATION);
      animationStartTimeRef.current = null;
    }
  };

  // DragControls handlers
  const handleDragStart = () => {
    jointManager.mountWriter(WRITER_ID.DRAG, WRITER_PRIORITY.DRAG);
    if (isSyncActive) {
      jointManager.unmountWriter(WRITER_ID.SYN);
      // sendMessage('cancel stream joint position');
      // sendMessage('cancel stream mode');
    }
    onDrag?.(true);
  };
  const handleDragEnd = () => {
    // Unmount SYN writer if sync is active (method call will be triggered)
    if (isSyncActive) {
      setPendingJoints(jointManager.getAngles());
    }
    jointManager.unmountWriter(WRITER_ID.DRAG);
    onDrag?.(false);
  };
  const handleHover = (joint: URDFJoint) => {
    if (joint && !drag) {
      highlightJointGeometry(joint, true);
      const robot = robotRef.current;
      const jointNames = robot ? Object.keys(robot.joints ?? {}) : [];
      const jointIndex = jointNames.indexOf(joint.name);
      setHoveredJointMesh?.(jointIndex !== -1 ? jointIndex : null);
      if (gl && gl.domElement) gl.domElement.style.cursor = 'pointer';
    }
  };
  const handleUnhover = (joint: URDFJoint | null) => {
    if (joint && !drag) {
      highlightJointGeometry(joint, false);
      setHoveredJointMesh?.(null);
    }
    hoveredJointRef.current = null;
    if (gl && gl.domElement) gl.domElement.style.cursor = 'default';
  };

  const handleUpdateJoint = (joint: URDFJoint, angle: number) => {
    const robot = robotRef.current;
    if (!robot) return;
    const jointNames = Object.keys(robot.joints ?? {});
    const jointIndex = jointNames.indexOf(joint.name);
    const newAngles = [...jointAnglesRef.current];
    let min = -Infinity;
    let max = Infinity;
    if (joint.limit) {
      min = joint.limit.lower ?? -Infinity;
      max = joint.limit.upper ?? Infinity;
    }
    const clampedAngle = Math.max(min, Math.min(max, angle));
    newAngles[jointIndex] = clampedAngle;
    jointManager.setAngles(WRITER_ID.DRAG, newAngles);
  };

  // only apply Joints on robot here!!!
  const applyJointAngles = (robot: URDFRobot, jointNames: string[]) => {
    if (!robot || !localJointAngles.length) return;

    jointNames.forEach((name, index) => {
      if (index < localJointAngles.length) {
        const angle = localJointAngles[index] ?? 0;
        robot.setJointValue(name, angle);
      }
    });
    robot.updateMatrixWorld(true);

    updateGoalToEndEffector();
  };

  // Local helpers
  const findEndEffectorInRobot = (robot: URDFRobot | null) => {
    if (!robot) return null;
    for (const name of END_EFFECTOR_NAMES) {
      const candidate = robot.getObjectByName(name);
      if (candidate) return candidate;
    }
    let fallback: any = null;
    robot.traverse((obj) => {
      fallback = obj;
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

  const highlightJointGeometry = (joint: URDFJoint, highlight: boolean) => {
    if (!joint) return;
    const traverse = (obj: any) => {
      // console.log(obj);
      if (obj.type === 'Mesh') {
        if (highlight) {
          if (!originalMaterialMapRef.current.has(obj)) {
            originalMaterialMapRef.current.set(obj, obj.material);
          }
          // Clone the original material and change color/emissive
          const origMat = obj.material;
          const highlightMat = origMat.clone();
          if ('color' in highlightMat) highlightMat.color.set(0xbbeeff);
          if ('emissive' in highlightMat) {
            highlightMat.emissive.set(0x3399ff);
            highlightMat.emissiveIntensity = 4.0;
          }
          obj.material = highlightMat;
        } else {
          const orig = originalMaterialMapRef.current.get(obj);
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
  };

  const solveIKOnce = useCallback(() => {
    const robot = robotRef.current;
    const goal = goalRef.current;
    const solver = solverRef.current;
    const ikRoot = ikRootRef.current;
    const robotGroup = robotGroupRef.current;

    if (!robot || !goal || !solver || !ikRoot || !robotGroup) {
      console.warn('IK components not ready');
      return;
    }

    // Sync IK with current robot state
    setIKFromUrdf(ikRoot, robot);

    // Solve IK
    const statuses = solver.solve();
    const statusesArr = [...statuses];
    onSolveStatusesChange?.(statusesArr);

    const converged = statusesArr.every((status: number) => status === SOLVE_STATUS.CONVERGED);
    convergedRef.current = converged;

    if (converged) {
      setUrdfFromIK(robot, ikRoot);
      robot.updateMatrixWorld(true);

      // Extract new angles from robot after IK solution
      const jointNames = Object.keys(robot.joints ?? {});
      const newAngles = jointNames.map((name) => robot.joints[name]?.angle ?? 0);
      jointAnglesRef.current = newAngles;

      // Update last valid goal
      lastValidGoalPositionRef.current = [...goalPosition];
      lastValidGoalQuaternionRef.current = [...goalQuaternion];

      return newAngles;
    }

    return null;
  }, [goalPosition, goalQuaternion, onSolveStatusesChange]);

  return (
    <>
      <RobotLoader urdfPath={urdfPath} onRobotReady={handleRobotReady} />
      {robotRef.current && (
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
      )}
      <MessageController
        pendingJoints={pendingJoints}
        setPendingJoints={setPendingJoints}
        jointManager={jointManager}
      />
      {!isAnimatingRef.current && showGoalMarker && (
        <GoalMarker
          onPositionChange={setGoalPosition}
          onQuaternionChange={setGoalQuaternion}
          goalQuaternion={goalQuaternion}
          onDrag={onDrag}
          handleUnhover={handleUnhover}
          goalPosition={goalPosition}
          converged={convergedRef.current}
          jointManager={jointManager}
          {...(robotRef.current ? { robot: robotRef.current } : {})}
          {...(setMovedDistance ? { setMovedDistance } : {})}
          setPendingJoints={setPendingJoints}
          solveIKOnce={solveIKOnce}
        />
      )}
    </>
  );
}
