import { Environment, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import {
  Suspense,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import type { URDFRobot } from "urdf-loader/src/URDFClasses";

import { useAppFeedback } from "../../../app/context/AppFeedbackContext";
import FeedbackPopupContent from "../../../app/components/FeedbackPopupContent";
import type { Robot } from "../../../entities/robot/model/types";
import { useRobotControl } from "../../robot-control/context/RobotControlContext";
import { useRobotInteraction } from "../../robot-control/context/RobotInteractionContext";
import {
  JOINT_SOURCE_ID,
  type JointProperty,
  type JointStateSnapshot,
  type JointType,
} from "../../robot-control/model/jointStateManager";
import { resolveHomeAnglesForModel } from "../../robot-control/model/robotModels";
import type { ViewportSceneState } from "../model/sceneState";
import {
  getToolPointWorldPosition,
  getToolPointWorldQuaternion,
} from "../model/robotIk";
import { createRobotIkModel, type RobotIkModel } from "../model/robotIkModel";
import { useSolverConfig } from "../context/SolverConfigContext";
import { generateWorkspaceSurface } from "../model/workspaceSurfaceGeneration";
import DragControls from "./DragControls";
import EnvironmentErrorBoundary from "./EnvironmentErrorBoundary";
import EnvironmentLoader from "./EnvironmentLoader";
import GoalMarker from "./GoalMarker";
import RobotActionsPanel from "./RobotActionsPanel";
import SolverStatusPanel, {
  type SolverStatusSnapshot,
} from "./SolverStatusPanel";
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
  onSolverStatusChange?: (status: SolverStatusSnapshot | null) => void;
  onMovedDistanceChange?: (distance: number) => void;
}

// Solver-facing articulation chain: only revolute / continuous joints in traversal order.
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
        jointObject.jointType === "continuous")
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

function getAllJointNames(robot: URDFRobot): string[] {
  return Object.keys(robot.joints ?? {});
}

function getJointAnglesFromRobot(
  robot: URDFRobot,
  jointNames: string[],
): number[] {
  return jointNames.map((jointName) => {
    const value = robot.joints?.[jointName]?.angle;
    return Number.isFinite(value) ? value : 0;
  });
}

function extractJointProperties(
  robot: URDFRobot,
  jointNames: string[],
): Record<string, JointProperty | null> {
  return Object.fromEntries(
    jointNames.map((jointName) => {
      const joint = robot.joints?.[jointName] as
        | {
            jointType?: string;
            limit?: { lower?: number; upper?: number };
          }
        | undefined;

      if (!joint) {
        return [jointName, null];
      }

      const jointType = (joint.jointType ?? "revolute") as JointType;
      const lower = joint.limit?.lower;
      const upper = joint.limit?.upper;

      if (jointType === "prismatic") {
        return [
          jointName,
          {
            jointType,
            min: Number.isFinite(lower) ? (lower as number) : 0,
            max: Number.isFinite(upper) ? (upper as number) : 1,
          },
        ];
      }

      return [
        jointName,
        {
          jointType,
          min: Number.isFinite(lower) ? (lower as number) : -Math.PI,
          max: Number.isFinite(upper) ? (upper as number) : Math.PI,
        },
      ];
    }),
  );
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

function renderWorkspaceLoadingContent(
  label: string,
  percent: number,
): ReactNode {
  return (
    <FeedbackPopupContent
      variant="progress"
      title="Generating Workspace"
      description={label}
      progressPercent={percent}
      showSpinner={false}
    />
  );
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

    const material = (
      Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    ) as THREE.MeshPhysicalMaterial | undefined;
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
        const material = (
          Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        ) as THREE.MeshPhysicalMaterial | undefined;
        if (!material) return;
        material.emissive.set(0x0ea5e9);
        material.emissiveIntensity = 0.35;
      });
    }
  }
}

function configureRobotMaterials(loadedRobot: URDFRobot) {
  loadedRobot.traverse((object: THREE.Object3D) => {
    if (object.type === "URDFCollider") {
      object.visible = false;
    }

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
    if (object.type === "URDFCollider") {
      object.visible = showCollisionMap;
    }

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
  jointPropertiesByName: {},
};

function ViewportRobot({
  robot,
  isSelected,
  onDraggingChange,
  onSolverStatusChange,
  onMovedDistanceChange,
}: ViewportRobotProps) {
  const feedback = useAppFeedback();
  const { config: solverConfig } = useSolverConfig();
  const { controller, getJointManager, selectRobot } = useRobotControl();
  const {
    beginManipulation,
    dragCancelSequence,
    endManipulation,
    getHighlightedJointName,
    ikCancelSequence,
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
  const [goalPosition, setGoalPosition] = useState<THREE.Vector3 | null>(null);
  const [goalQuaternion, setGoalQuaternion] = useState<THREE.Quaternion | null>(
    null,
  );
  const [ikConverged, setIkConverged] = useState(true);
  const [workspacePoints, setWorkspacePoints] = useState<THREE.Vector3[]>([]);
  const [workspaceGenerationState, setWorkspaceGenerationState] = useState<
    "idle" | "generating" | "ready"
  >("idle");
  const sharedHighlightedJointName = isSelected
    ? getHighlightedJointName(robot.robotId)
    : null;
  const groupRef = useRef<THREE.Group>(null);
  const loadedRobotRef = useRef<URDFRobot | null>(null);
  const ikModelRef = useRef<RobotIkModel | null>(null);
  const abortAreaHoveredRef = useRef(isAbortAreaHovered);
  const originalMaterialMapRef = useRef<Map<THREE.Object3D, THREE.Material>>(
    new Map(),
  );
  const workspaceAbortRef = useRef<AbortController | null>(null);
  const handledWorkspaceGenerationVersionRef = useRef(0);
  const ikConvergedRef = useRef(true);
  const goalPositionRef = useRef<THREE.Vector3 | null>(null);
  const goalQuaternionRef = useRef<THREE.Quaternion | null>(null);
  const lastValidGoalPositionRef = useRef<THREE.Vector3 | null>(null);
  const lastValidGoalQuaternionRef = useRef<THREE.Quaternion | null>(null);
  const lastSolverStatusRef = useRef("");
  const ikJointNamesRef = useRef<string[]>([]);

  useEffect(() => {
    abortAreaHoveredRef.current = isAbortAreaHovered;
  }, [isAbortAreaHovered]);

  useEffect(() => {
    ikConvergedRef.current = ikConverged;
  }, [ikConverged]);

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

    const loadingKey = `viewport.robot.${robot.robotId}`;
    let disposed = false;
    let finalizeFrame: number | null = null;
    const loadingManager = new THREE.LoadingManager();
    const loader = new URDFLoader(loadingManager);
    loader.parseVisual = true;
    loader.parseCollision = true;

    let pendingRobot: URDFRobot | null = null;

    feedback.showLoading(loadingKey, `Loading robot ${robot.displayName}`);

    loadingManager.onLoad = () => {
      const loadedRobot = pendingRobot;
      if (!loadedRobot || disposed || !groupRef.current) return;
      const latestRobot =
        controller.getSnapshot().robot.byId[robot.robotId] ?? robot;
      const latestAllJointNames = latestRobot.visual.allUrdfJointNames ?? [];

      const groupNode = groupRef.current;
      const previous = loadedRobotRef.current;
      if (previous) {
        groupNode.remove(previous);
      }

      const ikJointNames = getOrderedRevoluteJointNames(loadedRobot);
      const managerJointNamesFromUrdf = getAllJointNames(loadedRobot);
      ikJointNamesRef.current = ikJointNames;

      if (
        latestAllJointNames.length !== managerJointNamesFromUrdf.length ||
        latestAllJointNames.some(
          (jointName, index) => jointName !== managerJointNamesFromUrdf[index],
        )
      ) {
        controller.updateRobotVisualBinding(robot.robotId, {
          allUrdfJointNames: managerJointNamesFromUrdf,
        });
      }

      if (manager && managerJointNamesFromUrdf.length > 0) {
        manager.setJointNames(managerJointNamesFromUrdf);
        manager.setJointProperties(
          extractJointProperties(loadedRobot, managerJointNamesFromUrdf),
        );
      }

      const resolvedHomeAngles =
        latestRobot.visual.urdfId && managerJointNamesFromUrdf.length > 0
          ? resolveHomeAnglesForModel(
              latestRobot.visual.urdfId,
              managerJointNamesFromUrdf,
            )
          : null;

      if (
        (!latestRobot.homeAngles ||
          latestRobot.homeAngles.length !== managerJointNamesFromUrdf.length) &&
        resolvedHomeAngles
      ) {
        controller.updateRobotHomeAngles(robot.robotId, resolvedHomeAngles);
      } else if (
        !latestRobot.homeAngles &&
        managerJointNamesFromUrdf.length > 0
      ) {
        controller.updateRobotHomeAngles(
          robot.robotId,
          getJointAnglesFromRobot(loadedRobot, managerJointNamesFromUrdf),
        );
      }

      const managerJointNames =
        manager?.getOrderedJointNames() ??
        managerJointNamesFromUrdf ??
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
      ikModelRef.current = createRobotIkModel(loadedRobot, ikJointNames);
      groupNode.add(loadedRobot);
      setLoadedRobotState(loadedRobot);

      const homeAngles =
        resolvedHomeAngles &&
        (!latestRobot.homeAngles ||
          latestRobot.homeAngles.length !== managerJointNames.length)
          ? resolvedHomeAngles
          : latestRobot.homeAngles;
      feedback.hideLoading(loadingKey);

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

        if (homeAngles && homeAngles.length === managerJointNames.length) {
          controller
            .getJointRuntime()
            .startAnimationToAngles(robot.robotId, homeAngles, {
              durationMs: 900,
            });
        }
      });
    };

    loader.load(
      urdfPath,
      (loadedRobot) => {
        pendingRobot = loadedRobot;
      },
      undefined,
      (error: unknown) => {
        feedback.hideLoading(loadingKey);
        console.error(`Failed to load URDF for ${robot.displayName}`, error);
        feedback.showError(`Failed to load robot ${robot.displayName}`, {
          description:
            error instanceof Error
              ? error.message
              : "Unknown robot loading error.",
          key: loadingKey,
        });
      },
    );

    return () => {
      disposed = true;
      feedback.hideLoading(loadingKey);
      if (finalizeFrame !== null) {
        window.cancelAnimationFrame(finalizeFrame);
      }
      if (groupRef.current && loadedRobotRef.current) {
        groupRef.current.remove(loadedRobotRef.current);
      }
      loadedRobotRef.current = null;
      ikModelRef.current = null;
      setLoadedRobotState(null);
      pendingRobot = null;
    };
  }, [
    feedback,
    controller,
    manager,
    robot.displayName,
    robot.robotId,
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
    if (
      !isSelected ||
      !loadedRobotState ||
      !groupRef.current ||
      managerState.activeSourceId === JOINT_SOURCE_ID.IK
    ) {
      return;
    }

    const nextGoalPosition = getToolPointWorldPosition(loadedRobotState);
    const nextGoalQuaternion = getToolPointWorldQuaternion(loadedRobotState);
    setGoalPosition(nextGoalPosition);
    setGoalQuaternion(nextGoalQuaternion);
    goalPositionRef.current = nextGoalPosition?.clone() ?? null;
    goalQuaternionRef.current = nextGoalQuaternion?.clone() ?? null;
    setIkConverged(true);
    lastValidGoalPositionRef.current = nextGoalPosition?.clone() ?? null;
    lastValidGoalQuaternionRef.current = nextGoalQuaternion?.clone() ?? null;
  }, [
    isSelected,
    loadedRobotState,
    managerState.activeSourceId,
    managerState.angles,
    robot.robotId,
  ]);

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

    applyJointHighlightState(
      loadedRobot,
      sharedHighlightedJointName,
      draggedJointName,
    );
  }, [draggedJointName, sharedHighlightedJointName]);

  useEffect(() => {
    setWorkspacePoints([]);
    setWorkspaceGenerationState("idle");
    handledWorkspaceGenerationVersionRef.current = 0;
    feedback.hideLoading(`workspace.${robot.robotId}`);
    workspaceAbortRef.current?.abort();
    workspaceAbortRef.current = null;
  }, [feedback, robot.robotId, robot.visual.urdfUrl]);

  useEffect(() => {
    if (!robot.panel.workspaceAbortVersion) {
      return;
    }
    feedback.hideLoading(`workspace.${robot.robotId}`);
    workspaceAbortRef.current?.abort();
    workspaceAbortRef.current = null;
    setWorkspaceGenerationState("idle");
    controller.updateRobotPanelState(robot.robotId, {
      workspaceProgressPercent: null,
      workspaceProgressLabel: null,
    });
  }, [feedback, robot.panel.workspaceAbortVersion, robot.robotId]);

  useEffect(() => {
    const loadedRobot = loadedRobotState;
    const localRoot = groupRef.current;
    const loadingKey = `workspace.${robot.robotId}`;
    const generationVersion = robot.panel.workspaceGenerationVersion;

    if (!loadedRobot || !localRoot) {
      return;
    }

    if (generationVersion <= handledWorkspaceGenerationVersionRef.current) {
      return;
    }
    handledWorkspaceGenerationVersionRef.current = generationVersion;

    feedback.hideLoading(loadingKey);
    workspaceAbortRef.current?.abort();
    const abortController = new AbortController();
    workspaceAbortRef.current = abortController;
    setWorkspacePoints([]);
    setWorkspaceGenerationState("generating");
    controller.updateRobotPanelState(robot.robotId, {
      workspaceGenerationPending: true,
      workspaceProgressPercent: 0,
      workspaceProgressLabel: "Starting workspace generation",
    });
    feedback.showLoading(
      loadingKey,
      renderWorkspaceLoadingContent("Starting workspace generation", 0),
      { spinner: false },
    );

    void generateWorkspaceSurface({
      robot: loadedRobot,
      localRoot,
      sampleCount: robot.panel.workspaceSampleCount,
      signal: abortController.signal,
      onProgress(progress) {
        feedback.showLoading(
          loadingKey,
          renderWorkspaceLoadingContent(progress.label, progress.percent),
          { spinner: false },
        );
        controller.updateRobotPanelState(robot.robotId, {
          workspaceProgressPercent: progress.percent,
          workspaceProgressLabel: progress.label,
        });
      },
    })
      .then((points) => {
        if (workspaceAbortRef.current !== abortController) {
          return;
        }
        setWorkspacePoints(points);
        setWorkspaceGenerationState("ready");
        controller.updateRobotPanelState(robot.robotId, {
          workspaceGenerationPending: false,
          workspaceGeneratedSampleCount: robot.panel.workspaceSampleCount,
          workspaceProgressPercent: 100,
          workspaceProgressLabel: "Workspace ready",
        });
        feedback.hideLoading(loadingKey);
        feedback.showSuccess(`Workspace ready for ${robot.displayName}`);
      })
      .catch((error: unknown) => {
        if (workspaceAbortRef.current !== abortController) {
          return;
        }
        setWorkspaceGenerationState("idle");
        controller.updateRobotPanelState(robot.robotId, {
          workspaceGenerationPending: false,
          workspaceProgressPercent: null,
          workspaceProgressLabel: null,
        });
        feedback.hideLoading(loadingKey);
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        feedback.showError(
          `Failed to generate workspace for ${robot.displayName}`,
          {
            description:
              error instanceof Error
                ? error.message
                : "Unknown workspace generation error.",
            key: loadingKey,
          },
        );
      })
      .finally(() => {
        if (workspaceAbortRef.current === abortController) {
          workspaceAbortRef.current = null;
        }
      });
  }, [
    feedback,
    loadedRobotState,
    robot.displayName,
    robot.panel.workspaceGenerationVersion,
    robot.panel.workspaceSampleCount,
    robot.robotId,
  ]);

  const canDrag =
    isSelected &&
    !!manager &&
    !!loadedRobotState &&
    managerState.activeSourceId !== JOINT_SOURCE_ID.MANUAL &&
    managerState.activeSourceId !== JOINT_SOURCE_ID.ANIMATION &&
    managerState.activeSourceId !== JOINT_SOURCE_ID.RESET;

  const canManipulateIk =
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

  const handleGoalDragStart = useCallback(() => {
    if (!manager) {
      return;
    }
    beginManipulation(robot.robotId, JOINT_SOURCE_ID.IK);
    onDraggingChange?.(true);
  }, [beginManipulation, manager, onDraggingChange, robot.robotId]);

  const handleGoalDragEnd = useCallback(() => {
    if (!manager) {
      return;
    }
    const shouldCancel = abortAreaHoveredRef.current || !ikConvergedRef.current;
    if (
      shouldCancel &&
      lastValidGoalPositionRef.current &&
      lastValidGoalQuaternionRef.current
    ) {
      setGoalPosition(lastValidGoalPositionRef.current.clone());
      setGoalQuaternion(lastValidGoalQuaternionRef.current.clone());
      goalPositionRef.current = lastValidGoalPositionRef.current.clone();
      goalQuaternionRef.current = lastValidGoalQuaternionRef.current.clone();
      ikConvergedRef.current = true;
      setIkConverged(true);
    }
    endManipulation({
      cancel: shouldCancel,
    });
    onDraggingChange?.(false);
  }, [endManipulation, manager, onDraggingChange]);

  const handleGoalPositionChange = useCallback(
    (nextPosition: THREE.Vector3) => {
      if (!manager || !loadedRobotState) {
        return;
      }

      setGoalPosition(nextPosition.clone());
      goalPositionRef.current = nextPosition.clone();
    },
    [loadedRobotState, manager],
  );

  const handleGoalQuaternionChange = useCallback(
    (nextQuaternion: THREE.Quaternion) => {
      setGoalQuaternion(nextQuaternion.clone());
      goalQuaternionRef.current = nextQuaternion.clone();
    },
    [],
  );

  useFrame(() => {
    controller.getJointRuntime().advanceAnimation(robot.robotId);

    const ikModel = ikModelRef.current;
    const visibleRobot = loadedRobotRef.current;
    const robotGroup = groupRef.current;
    const targetPosition = goalPositionRef.current;
    const targetQuaternion = goalQuaternionRef.current;
    const isActiveIkManipulation =
      managerState.activeSourceId === JOINT_SOURCE_ID.IK;
    const hasConflictingManipulation =
      managerState.activeSourceId !== null &&
      managerState.activeSourceId !== JOINT_SOURCE_ID.IK &&
      managerState.activeSourceId !== JOINT_SOURCE_ID.FK;

    if (
      !isSelected ||
      !ikModel ||
      !visibleRobot ||
      !robotGroup ||
      !manager ||
      !targetPosition ||
      !targetQuaternion ||
      hasConflictingManipulation
    ) {
      return;
    }

    const jointNames = manager.getOrderedJointNames();
    const ikJointNames = ikJointNamesRef.current;
    const currentAngles = manager.getAngles();
    ikModel.setConfig(solverConfig);
    const jointNameToIndexMap = manager.getJointNameToIndexMap();
    const ikAngles = ikJointNames.map((jointName) => {
      const index = jointNameToIndexMap[jointName];
      return index === undefined ? 0 : (currentAngles[index] ?? 0);
    });
    ikModel.syncFromAngles(ikAngles);

    const result = ikModel.solve(
      {
        position: targetPosition,
        quaternion: targetQuaternion,
        constraintMode: robot.panel.goalMarkerConstraintMode,
      },
      robotGroup,
    );
    if (!result) {
      if (ikConvergedRef.current) {
        ikConvergedRef.current = false;
        setIkConverged(false);
      }
      if (lastSolverStatusRef.current !== "null") {
        lastSolverStatusRef.current = "null";
        onSolverStatusChange?.(null);
      }
      return;
    }

    const nextSolverStatus = {
      constraintMode: robot.panel.goalMarkerConstraintMode,
      converged: result.converged,
      statuses: result.statuses,
      translationError: Number(result.translationError.toFixed(6)),
      rotationError: Number(result.rotationError.toFixed(6)),
      targetPosition: [
        Number(targetPosition.x.toFixed(6)),
        Number(targetPosition.y.toFixed(6)),
        Number(targetPosition.z.toFixed(6)),
      ] as [number, number, number],
      toolPosition: [
        Number(result.toolPosition.x.toFixed(6)),
        Number(result.toolPosition.y.toFixed(6)),
        Number(result.toolPosition.z.toFixed(6)),
      ] as [number, number, number],
    };
    const nextSolverStatusKey = JSON.stringify(nextSolverStatus);
    if (nextSolverStatusKey !== lastSolverStatusRef.current) {
      lastSolverStatusRef.current = nextSolverStatusKey;
      onSolverStatusChange?.(nextSolverStatus);
    }

    if (ikConvergedRef.current !== result.converged) {
      ikConvergedRef.current = result.converged;
      setIkConverged(result.converged);
    }

    if (!result.converged) {
      if (
        !isActiveIkManipulation &&
        lastValidGoalPositionRef.current &&
        lastValidGoalQuaternionRef.current
      ) {
        goalPositionRef.current = lastValidGoalPositionRef.current.clone();
        goalQuaternionRef.current = lastValidGoalQuaternionRef.current.clone();
        setGoalPosition(lastValidGoalPositionRef.current.clone());
        setGoalQuaternion(lastValidGoalQuaternionRef.current.clone());
        ikConvergedRef.current = true;
        setIkConverged(true);
      }
      return;
    }

    lastValidGoalPositionRef.current = targetPosition.clone();
    lastValidGoalQuaternionRef.current = targetQuaternion.clone();
    if (isActiveIkManipulation) {
      const nextAngles = [...currentAngles];
      ikJointNames.forEach((jointName, index) => {
        const managerIndex = jointNameToIndexMap[jointName];
        if (managerIndex !== undefined) {
          nextAngles[managerIndex] =
            result.angles[index] ?? nextAngles[managerIndex];
        }
      });
      manager.updateFromSource(JOINT_SOURCE_ID.IK, nextAngles);
      applyJointAngles(visibleRobot, jointNames, nextAngles);
    }
  });

  useEffect(() => {
    if (isSelected) return;
    setHoveredJointName(null);
    setDraggedJointName(null);
    onMovedDistanceChange?.(0);
  }, [isSelected, onMovedDistanceChange]);

  useEffect(() => {
    if (!draggedJointName) {
      return;
    }
    setDraggedJointName(null);
    onDraggingChange?.(false);
  }, [dragCancelSequence, draggedJointName, onDraggingChange]);

  useEffect(() => {
    if (isSelected) {
      return;
    }
    lastSolverStatusRef.current = "";
    onSolverStatusChange?.(null);
  }, [isSelected, onSolverStatusChange]);

  useEffect(() => {
    ikModelRef.current?.setConfig(solverConfig);
  }, [solverConfig]);

  useEffect(() => {
    const highlightedJointName = isSelected
      ? (draggedJointName ?? hoveredJointName ?? null)
      : null;
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
  const handleSelectRobot = useCallback(
    (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      if (isSelected) {
        return;
      }
      selectRobot(robot.robotId);
    },
    [isSelected, robot.robotId, selectRobot],
  );

  return (
    <>
      <group
        ref={groupRef}
        position={[origin.x, origin.y, origin.z]}
        onClick={handleSelectRobot}
      >
        {isSelected && <axesHelper args={[0.2]} />}
        <WorkspacePointCloud
          points={workspacePoints}
          visible={robot.panel.showWorkspace}
        />
        {loadedRobotState && (
          <DragControls
            robot={loadedRobotState}
            enabled={canDrag}
            cancelSequence={dragCancelSequence}
            onDragStart={handleDragJointStart}
            onDragEnd={handleDragJointEnd}
            onHover={handleHoverJoint}
            onUnhover={handleUnhoverJoint}
            onUpdateJoint={handleUpdateJoint}
          />
        )}
      </group>
      {isSelected && loadedRobotState && robot.panel.goalMarkerEnabled ? (
        <GoalMarker
          enabled={canManipulateIk}
          mode={robot.panel.goalMarkerMode}
          space={robot.panel.goalMarkerSpace}
          position={goalPosition}
          quaternion={goalQuaternion}
          converged={ikConverged}
          cancelSequence={ikCancelSequence}
          onPositionChange={handleGoalPositionChange}
          onQuaternionChange={handleGoalQuaternionChange}
          onMovedDistanceChange={onMovedDistanceChange}
          onDragStart={handleGoalDragStart}
          onDragEnd={handleGoalDragEnd}
          onCanceledPointerRelease={() => onDraggingChange?.(false)}
        />
      ) : null}
    </>
  );
}

export default function Viewport({ sceneState }: ViewportProps) {
  const { activeRobot, robots, activeRobotId } = useRobotControl();
  const { manipulation, isAbortAreaHovered, setAbortAreaHovered } =
    useRobotInteraction();
  const [dragging, setDragging] = useState(false);
  const [solverStatus, setSolverStatus] = useState<SolverStatusSnapshot | null>(
    null,
  );
  const [movedDistance, setMovedDistance] = useState(0);
  const orbitControlsRef = useRef<any>(null);
  const abortAreaRef = useRef<HTMLDivElement>(null);
  const renderableRobots = useMemo(
    () => robots.filter((robot) => robot.visual.urdfUrl),
    [robots],
  );

  const handleDraggingChange = useCallback((nextDragging: boolean) => {
    if (orbitControlsRef.current) {
      orbitControlsRef.current.enabled = !nextDragging;
    }
    setDragging(nextDragging);
  }, []);

  useEffect(() => {
    const syncAbortActive =
      manipulation?.syncMode &&
      (manipulation.sourceId === JOINT_SOURCE_ID.DRAG ||
        manipulation.sourceId === JOINT_SOURCE_ID.IK);
    if (!syncAbortActive) {
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
  }, [manipulation?.sourceId, manipulation?.syncMode, setAbortAreaHovered]);

  return (
    <div className="relative h-full w-full">
      {sceneState.settings.stats && (
        <div className="absolute left-0 top-0 z-10">
          <StatsOverlay />
        </div>
      )}
      <div className="absolute left-2 bottom-2 z-10">
        <SolverStatusPanel
          status={solverStatus}
          movedDistance={movedDistance}
        />
      </div>
      <div className="absolute right-2 top-2 z-10">
        <RobotActionsPanel robot={activeRobot} />
      </div>
      {manipulation?.syncMode &&
        (manipulation.sourceId === JOINT_SOURCE_ID.DRAG ||
          manipulation.sourceId === JOINT_SOURCE_ID.IK) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center px-2">
            <div
              ref={abortAreaRef}
              className={`pointer-events-auto w-full border px-1 py-10 text-center text-sm transition-colors ${
                isAbortAreaHovered
                  ? "border-red-400/60 bg-red-500/15 text-red-100"
                  : "border-[rgb(var(--panel-border)/0.2)] bg-[rgb(var(--panel-bg)/0.9)] text-[rgb(var(--fg-muted))]"
              }`}
            >
              Release here or press Esc to cancel synchronized manipulation
            </div>
          </div>
        )}

      <Canvas camera={{ position: [2.5, 1.6, -3.2], up: [0, 1, 0], fov: 50 }}>
        {sceneState.settings.environment ? (
          <EnvironmentErrorBoundary
            fallback={
              <>
                <ambientLight intensity={1.2} />
                <directionalLight position={[5, 10, 7.5]} intensity={0.9} />
              </>
            }
          >
            <Suspense fallback={<EnvironmentLoader />}>
              <Environment
                files={
                  "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/quarry_04_puresky_2k.hdr"
                }
                environmentIntensity={0.6}
                backgroundIntensity={0.5}
                background={true}
              />
            </Suspense>
          </EnvironmentErrorBoundary>
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
        <OrbitControls ref={orbitControlsRef} enabled={!dragging} />

        {renderableRobots.map((robot) => (
          <ViewportRobot
            key={robot.robotId}
            robot={robot}
            isSelected={robot.robotId === activeRobotId}
            onDraggingChange={handleDraggingChange}
            onSolverStatusChange={setSolverStatus}
            onMovedDistanceChange={setMovedDistance}
          />
        ))}
      </Canvas>
    </div>
  );
}
