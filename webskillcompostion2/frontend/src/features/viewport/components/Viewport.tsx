import { Environment, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { URDFRobot } from "urdf-loader/src/URDFClasses.js";

import type { Robot } from "../../../entities/robot/model/types";
import { useRobotControl } from "../../robot-control/context/RobotControlContext";
import { useRobotInteraction } from "../../robot-control/context/RobotInteractionContext";
import {
  JOINT_SOURCE_ID,
  type JointStateSnapshot,
} from "../../robot-control/model/jointStateManager";
import type { ViewportSceneState } from "../model/sceneState";
import DragControls from "./DragControls";
import JointManagerStatePanel from "./JointManagerStatePanel";
import StatsOverlay from "./StatsOverlay";
import URDFLoader from "./URDFLoader";
import WorkspacePointCloud from "./WorkspacePointCloud";

interface ViewportProps {
  sceneState: ViewportSceneState;
}

interface ViewportRobotProps {
  robot: Robot;
  isSelected: boolean;
  onDraggingChange?: (dragging: boolean) => void;
}

function getOrderedRevoluteJointNames(robot: URDFRobot): string[] {
  if (!robot?.joints) return [];

  type TraversableJoint = {
    name: string;
    children?: THREE.Object3D[];
    jointType?: string;
  };

  let currentJoint: TraversableJoint | null = null;

  for (const child of robot.children) {
    if (child.type === "URDFJoint") {
      currentJoint = child as unknown as TraversableJoint;
      break;
    }
  }

  const ordered: string[] = [];
  while (currentJoint) {
    const jointName = currentJoint.name;
    const jointObject = robot.joints[jointName];
    if (
      jointObject &&
      (jointObject.jointType === "revolute" ||
        jointObject.jointType === "continuous" ||
        jointObject.jointType === "prismatic")
    ) {
      ordered.push(jointName);
    }

    let nextJoint: TraversableJoint | null = null;
    if (currentJoint.children?.length) {
      const urdfLink = currentJoint.children.find(
        (child) => child.type === "URDFLink",
      ) as THREE.Object3D | undefined;
      if (urdfLink?.children) {
        nextJoint =
          (urdfLink.children.find(
            (child) => child.type === "URDFJoint",
          ) as unknown as TraversableJoint | undefined) ?? null;
      }
    }
    currentJoint = nextJoint;
  }

  return ordered;
}

function applyJointAngles(
  loadedRobot: URDFRobot,
  jointNames: string[],
  angles: number[],
) {
  jointNames.forEach((jointName, index) => {
    loadedRobot.setJointValue(jointName, angles[index] ?? 0);
  });
  loadedRobot.updateMatrixWorld(true);
}

const collisionMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x880000,
  metalness: 0.2,
  roughness: 0.7,
  transparent: true,
  opacity: 0.7,
});

function createHiddenCollisionMaterial() {
  return new THREE.MeshPhysicalMaterial({
    transparent: true,
    opacity: 0,
  });
}

function createVisualRobotMaterial(color: number) {
  return new THREE.MeshPhysicalMaterial({
    color: color,
    metalness: 0.5,
    roughness: 0.6,
    clearcoat: 0.2,
    clearcoatRoughness: 0.3,
    reflectivity: 0.3,
    envMapIntensity: 0,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
}

function isWithinUrdfCollider(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.type === "URDFCollider") {
      return true;
    }
    if (current.type === "URDFVisual") {
      return false;
    }
    current = current.parent;
  }
  return typeof object.name === "string"
    ? object.name.toLowerCase().startsWith("collision_")
    : false;
}

function collectJointHighlightMeshes(joint: THREE.Object3D): THREE.Mesh[] {
  const rootLink =
    joint.children.find((child) => child.type === "URDFLink") ?? null;
  if (!rootLink) return [];

  const meshes: THREE.Mesh[] = [];

  function visit(node: THREE.Object3D) {
    for (const child of node.children) {
      if (child.type === "URDFJoint") {
        continue;
      }
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && !isWithinUrdfCollider(mesh)) {
        meshes.push(mesh);
      }
      visit(child);
    }
  }

  visit(rootLink);
  return meshes;
}

function applyJointHighlightState(
  loadedRobot: URDFRobot,
  hoveredJointName: string | null,
  draggedJointName: string | null,
) {
  const highlightedJointName = draggedJointName ?? hoveredJointName;

  loadedRobot.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || isWithinUrdfCollider(mesh)) return;

    const material = (Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material) as THREE.MeshPhysicalMaterial | undefined;
    if (!material) return;

    material.emissive.set(0x000000);
    material.emissiveIntensity = 0;
  });

  if (highlightedJointName) {
    const highlightedJoint = loadedRobot.joints?.[highlightedJointName] as
      | THREE.Object3D
      | undefined;
    if (highlightedJoint) {
      collectJointHighlightMeshes(highlightedJoint).forEach((mesh) => {
        const material = (Array.isArray(mesh.material)
          ? mesh.material[0]
          : mesh.material) as THREE.MeshPhysicalMaterial | undefined;
        if (!material) return;
        material.emissive.set(0x0ea5e9);
        material.emissiveIntensity = 0.35;
      });
    }
  }
}

function configureRobotMaterials(loadedRobot: URDFRobot) {
  loadedRobot.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    if (isWithinUrdfCollider(mesh)) {
      mesh.material = createHiddenCollisionMaterial();
      return;
    }

    const sourceMaterial = Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material;
    const sourceColor =
      sourceMaterial && "color" in sourceMaterial
        ? (sourceMaterial.color as THREE.Color).getHex()
        : 0xffffff;

    mesh.material = createVisualRobotMaterial(sourceColor);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function applyCollisionMeshState(
  loadedRobot: URDFRobot,
  showCollisionMap: boolean,
  originalMaterialMap: Map<THREE.Object3D, THREE.Material>,
) {
  loadedRobot.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !isWithinUrdfCollider(mesh)) return;

    if (showCollisionMap) {
      originalMaterialMap.set(object, mesh.material as THREE.Material);
      mesh.material = collisionMaterial;
      return;
    }

    const originalMaterial = originalMaterialMap.get(object);
    if (originalMaterial) {
      mesh.material = originalMaterial;
    }
  });
  if (!showCollisionMap) {
    originalMaterialMap.clear();
  }
}

function finalizeLoadedRobotVisualState(
  loadedRobot: URDFRobot,
  options: {
    showCollisionMap: boolean;
    originalMaterialMap: Map<THREE.Object3D, THREE.Material>;
    hoveredJointName: string | null;
    draggedJointName: string | null;
    jointNames: string[];
    angles: number[];
  },
) {
  configureRobotMaterials(loadedRobot);
  options.originalMaterialMap.clear();
  loadedRobot.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    const material = Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material;
    if (material) {
      options.originalMaterialMap.set(object, material);
    }
  });

  applyCollisionMeshState(
    loadedRobot,
    options.showCollisionMap,
    options.originalMaterialMap,
  );
  applyJointHighlightState(
    loadedRobot,
    options.hoveredJointName,
    options.draggedJointName,
  );
  applyJointAngles(loadedRobot, options.jointNames, options.angles);
}

const EMPTY_MANAGER_STATE: JointStateSnapshot = {
  angles: [],
  activeSourceId: null,
  jointNames: [],
};

function ViewportRobot({
  robot,
  isSelected,
  onDraggingChange,
}: ViewportRobotProps) {
  const { getJointManager } = useRobotControl();
  const {
    beginManipulation,
    endManipulation,
    isAbortAreaHovered,
    setHighlightedJointName,
  } = useRobotInteraction();
  const manager = getJointManager(robot.robotId);
  const [managerState, setManagerState] =
    useState<JointStateSnapshot>(EMPTY_MANAGER_STATE);
  const [loadedRobotState, setLoadedRobotState] = useState<URDFRobot | null>(
    null,
  );
  const [hoveredJointName, setHoveredJointName] = useState<string | null>(null);
  const [draggedJointName, setDraggedJointName] = useState<string | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const loadedRobotRef = useRef<URDFRobot | null>(null);
  const abortAreaHoveredRef = useRef(isAbortAreaHovered);
  const originalMaterialMapRef = useRef<Map<THREE.Object3D, THREE.Material>>(
    new Map(),
  );

  useEffect(() => {
    abortAreaHoveredRef.current = isAbortAreaHovered;
  }, [isAbortAreaHovered]);

  useEffect(() => {
    if (!manager) {
      setManagerState(EMPTY_MANAGER_STATE);
      return;
    }

    setManagerState(manager.getState());
    return manager.subscribe((snapshot) => {
      setManagerState(snapshot);
    });
  }, [manager]);

  useEffect(() => {
    const group = groupRef.current;
    const urdfPath = robot.visual.urdfUrl;
    if (!group || !urdfPath) return;

    let disposed = false;
    let finalizeFrame: number | null = null;
    const loadingManager = new THREE.LoadingManager();
    const loader = new URDFLoader(loadingManager);
    loader.parseVisual = true;
    loader.parseCollision = true;

    let pendingRobot: URDFRobot | null = null;

    loadingManager.onLoad = () => {
      const loadedRobot = pendingRobot;
      if (!loadedRobot || disposed || !groupRef.current) return;

      const groupNode = groupRef.current;
      const previous = loadedRobotRef.current;
      if (previous) {
        groupNode.remove(previous);
      }

      const loadedJointNames = getOrderedRevoluteJointNames(loadedRobot);
      if (manager && loadedJointNames.length > 0) {
        manager.setJointNames(loadedJointNames);
      }

      const managerJointNames =
        manager?.getOrderedJointNames() ??
        loadedJointNames ??
        robot.visual.orderedUrdfJointNames;
      finalizeLoadedRobotVisualState(loadedRobot, {
        showCollisionMap: robot.panel.showCollisionMap,
        originalMaterialMap: originalMaterialMapRef.current,
        hoveredJointName,
        draggedJointName,
        jointNames: managerJointNames,
        angles: manager?.getState().angles ?? [],
      });

      groupNode.rotation.x = -Math.PI / 2;
      loadedRobotRef.current = loadedRobot;
      groupNode.add(loadedRobot);
      setLoadedRobotState(loadedRobot);

      finalizeFrame = window.requestAnimationFrame(() => {
        if (disposed || loadedRobotRef.current !== loadedRobot) {
          return;
        }
        finalizeLoadedRobotVisualState(loadedRobot, {
          showCollisionMap: robot.panel.showCollisionMap,
          originalMaterialMap: originalMaterialMapRef.current,
          hoveredJointName,
          draggedJointName,
          jointNames: managerJointNames,
          angles: manager?.getState().angles ?? [],
        });
      });
    };

    loader.load(
      urdfPath,
      (loadedRobot) => {
        pendingRobot = loadedRobot;
      },
      undefined,
      (error: unknown) => {
        console.error(`Failed to load URDF for ${robot.displayName}`, error);
      },
    );

    return () => {
      disposed = true;
      if (finalizeFrame !== null) {
        window.cancelAnimationFrame(finalizeFrame);
      }
      if (groupRef.current && loadedRobotRef.current) {
        groupRef.current.remove(loadedRobotRef.current);
      }
      loadedRobotRef.current = null;
      setLoadedRobotState(null);
      pendingRobot = null;
    };
  }, [
    manager,
    robot.displayName,
    robot.visual.orderedUrdfJointNames,
    robot.visual.urdfUrl,
  ]);

  useEffect(() => {
    const loadedRobot = loadedRobotRef.current;
    if (!loadedRobot || !manager) return;

    const jointNames = manager.getOrderedJointNames();
    applyJointAngles(loadedRobot, jointNames, managerState.angles);
  }, [manager, managerState.angles]);

  useEffect(() => {
    const loadedRobot = loadedRobotRef.current;
    if (!loadedRobot) return;

    applyCollisionMeshState(
      loadedRobot,
      robot.panel.showCollisionMap,
      originalMaterialMapRef.current,
    );
  }, [robot.panel.showCollisionMap]);

  useEffect(() => {
    const loadedRobot = loadedRobotRef.current;
    if (!loadedRobot) return;

    applyJointHighlightState(loadedRobot, hoveredJointName, draggedJointName);
  }, [draggedJointName, hoveredJointName]);

  const canDrag =
    isSelected &&
    !!manager &&
    !!loadedRobotState &&
    managerState.activeSourceId !== JOINT_SOURCE_ID.ANIMATION &&
    managerState.activeSourceId !== JOINT_SOURCE_ID.RESET;

  const handleDragStart = useCallback(() => {
    if (!manager) {
      return;
    }
    beginManipulation(robot.robotId, JOINT_SOURCE_ID.DRAG);
    onDraggingChange?.(true);
  }, [beginManipulation, manager, onDraggingChange, robot.robotId]);

  const handleDragEnd = useCallback(() => {
    if (!manager) {
      return;
    }
    endManipulation({ cancel: abortAreaHoveredRef.current });
    onDraggingChange?.(false);
  }, [endManipulation, manager, onDraggingChange]);

  const handleUpdateJoint = useCallback(
    (joint: unknown, value: number) => {
      if (!manager) return;

      const candidate = joint as { name?: string | null };
      const jointName = candidate.name ?? null;
      if (!jointName) return;

      const jointIndex = manager.getJointNameToIndexMap()[jointName];
      if (jointIndex == null) return;

      const nextAngles = manager.getAngles();
      nextAngles[jointIndex] = value;
      manager.updateFromSource(JOINT_SOURCE_ID.DRAG, nextAngles);
    },
    [manager],
  );

  const handleHoverJoint = useCallback((joint: unknown) => {
    const candidate = joint as { name?: string | null };
    const jointName = candidate.name ?? null;
    setHoveredJointName(jointName);
  }, []);

  const handleUnhoverJoint = useCallback(() => {
    setHoveredJointName(null);
  }, []);

  const handleDragJointStart = useCallback(
    (joint: unknown) => {
      const candidate = joint as { name?: string | null };
      const jointName = candidate.name ?? null;
      setDraggedJointName(jointName);
      setHoveredJointName(jointName);
      handleDragStart();
    },
    [handleDragStart],
  );

  const handleDragJointEnd = useCallback(
    (joint: unknown) => {
      const candidate = joint as { name?: string | null };
      setDraggedJointName(null);
      const jointName = candidate.name ?? null;
      setHoveredJointName(jointName);
      handleDragEnd();
    },
    [handleDragEnd],
  );

  useEffect(() => {
    if (isSelected) return;
    setHoveredJointName(null);
    setDraggedJointName(null);
  }, [isSelected]);

  useEffect(() => {
    const highlightedJointName =
      isSelected ? draggedJointName ?? hoveredJointName ?? null : null;
    setHighlightedJointName(robot.robotId, highlightedJointName);
  }, [
    draggedJointName,
    hoveredJointName,
    isSelected,
    robot.robotId,
    setHighlightedJointName,
  ]);

  useEffect(() => {
    return () => {
      setHighlightedJointName(robot.robotId, null);
    };
  }, [robot.robotId, setHighlightedJointName]);

  const origin = robot.visual.origin;

  return (
    <group ref={groupRef} position={[origin.x, origin.y, origin.z]}>
      {isSelected && <axesHelper args={[0.2]} />}
      {loadedRobotState && (
        <DragControls
          robot={loadedRobotState}
          enabled={canDrag}
          onDragStart={handleDragJointStart}
          onDragEnd={handleDragJointEnd}
          onHover={handleHoverJoint}
          onUnhover={handleUnhoverJoint}
          onUpdateJoint={handleUpdateJoint}
        />
      )}
    </group>
  );
}

export default function Viewport({ sceneState }: ViewportProps) {
  const { robots, activeRobotId, activeRobot } = useRobotControl();
  const {
    manipulation,
    isAbortAreaHovered,
    setAbortAreaHovered,
  } = useRobotInteraction();
  const [dragging, setDragging] = useState(false);
  const abortAreaRef = useRef<HTMLDivElement>(null);
  const renderableRobots = useMemo(
    () => robots.filter((robot) => robot.visual.urdfUrl),
    [robots],
  );

  useEffect(() => {
    if (!manipulation?.syncMode) {
      setAbortAreaHovered(false);
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const abortArea = abortAreaRef.current;
      if (!abortArea) {
        setAbortAreaHovered(false);
        return;
      }

      const rect = abortArea.getBoundingClientRect();
      const hovered =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      setAbortAreaHovered(hovered);
    }

    window.addEventListener("pointermove", handlePointerMove);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      setAbortAreaHovered(false);
    };
  }, [manipulation?.syncMode, setAbortAreaHovered]);

  return (
    <div className="relative h-full w-full">
      {sceneState.settings.stats && (
        <div className="absolute left-0 top-0 z-10">
          <StatsOverlay />
        </div>
      )}
      <div className="absolute right-2 top-2 z-10">
        <JointManagerStatePanel />
      </div>
      {manipulation?.syncMode && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-4">
          <div
            ref={abortAreaRef}
            className={`pointer-events-auto min-w-56 rounded-sm border px-4 py-2 text-center text-xs transition-colors ${
              isAbortAreaHovered
                ? "border-red-400/60 bg-red-500/15 text-red-100"
                : "border-[rgb(var(--panel-border)/0.2)] bg-[rgb(var(--panel-bg)/0.9)] text-[rgb(var(--fg-muted))]"
            }`}
          >
            Release here or press Esc to cancel sync manipulation
          </div>
        </div>
      )}

      <Canvas camera={{ position: [2.5, 1.6, -3.2], up: [0, 1, 0], fov: 50 }}>
        {sceneState.settings.environment ? (
          <>
            <Suspense fallback={null}>
              <Environment
                files={
                  "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/quarry_04_puresky_2k.hdr"
                }
                environmentIntensity={0.6}
                backgroundIntensity={0.5}
                //ground={{ height: 5, radius: 40, scale: 20 }}
                background={true}
              />
            </Suspense>
          </>
        ) : (
          <>
            <ambientLight intensity={1.2} />
            <directionalLight position={[5, 10, 7.5]} intensity={0.9} />
          </>
        )}

        {sceneState.settings.effectComposer && (
          <EffectComposer>
            <Bloom luminanceThreshold={0.7} intensity={0.5} />
            <Vignette eskil={false} offset={0.12} darkness={0.28} />
          </EffectComposer>
        )}

        {sceneState.settings.grid && (
          <gridHelper args={[10, 10]} rotation={[0, Math.PI / 2, 0]} />
        )}

        <color
          attach="background"
          args={[sceneState.settings.environment ? "#161b22" : "#202025"]}
        />
        <OrbitControls enabled={!dragging} />

        {renderableRobots.map((robot) => (
          <ViewportRobot
            key={robot.robotId}
            robot={robot}
            isSelected={robot.robotId === activeRobotId}
            onDraggingChange={setDragging}
          />
        ))}

        <WorkspacePointCloud
          points={sceneState.workspacePoints}
          visible={activeRobot?.panel.showWorkspace ?? false}
        />
      </Canvas>
    </div>
  );
}
