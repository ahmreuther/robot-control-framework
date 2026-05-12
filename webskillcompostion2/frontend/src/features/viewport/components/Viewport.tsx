import { Environment, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import URDFLoader from "urdf-loader/src/URDFLoader.js";
import type { URDFRobot } from "urdf-loader/src/URDFClasses.js";

import type { Robot } from "../../../entities/robot/model/types";
import { useRobotControl } from "../../robot-control/context/RobotControlContext";
import type { ViewportSceneState } from "../model/sceneState";
import StatsOverlay from "./StatsOverlay";
import WorkspacePointCloud from "./WorkspacePointCloud";

interface ViewportProps {
  sceneState: ViewportSceneState;
}

interface ViewportRobotProps {
  robot: Robot;
  isActive: boolean;
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

function ViewportRobot({ robot, isActive }: ViewportRobotProps) {
  const { getJointManager } = useRobotControl();
  const manager = getJointManager(robot.robotId);
  const [angles, setAngles] = useState<number[]>(
    () => manager?.getAngles() ?? [],
  );
  const groupRef = useRef<THREE.Group>(null);
  const loadedRobotRef = useRef<URDFRobot | null>(null);

  useEffect(() => {
    if (!manager) {
      setAngles([]);
      return;
    }

    setAngles(manager.getAngles());
    return manager.subscribe((snapshot) => {
      setAngles(snapshot.angles);
    });
  }, [manager]);

  useEffect(() => {
    const group = groupRef.current;
    const urdfPath = robot.visual.urdfUrl;
    if (!group || !urdfPath) return;

    let disposed = false;
    const loader = new URDFLoader();
    loader.parseCollision = true;
    loader.parseVisual = true;

    loader.load(
      urdfPath,
      (loadedRobot) => {
        if (disposed || !groupRef.current) return;

        const groupNode = groupRef.current;
        const previous = loadedRobotRef.current;
        if (previous) {
          groupNode.remove(previous);
        }

        groupNode.rotation.x = -Math.PI / 2;
        loadedRobotRef.current = loadedRobot;
        groupNode.add(loadedRobot);

        const managerJointNames =
          manager?.getOrderedJointNames() ?? robot.visual.orderedUrdfJointNames;
        applyJointAngles(
          loadedRobot,
          managerJointNames,
          manager?.getAngles() ?? [],
        );

        loadedRobot.traverse((object: THREE.Object3D) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;

          const name = mesh.name.toLowerCase();
          if (name.startsWith("collision_")) {
            mesh.visible = false;
            return;
          }

          const material = mesh.material;
          const materials = Array.isArray(material) ? material : [material];
          materials.forEach((entry) => {
            const standard = entry as THREE.MeshStandardMaterial;
            if ("emissive" in standard) {
              standard.emissive.set(isActive ? 0x0d9ad7 : 0x000000);
              standard.emissiveIntensity = isActive ? 0.18 : 0;
            }
          });
        });
      },
      undefined,
      (error) => {
        console.error(`Failed to load URDF for ${robot.displayName}`, error);
      },
    );

    return () => {
      disposed = true;
      if (groupRef.current && loadedRobotRef.current) {
        groupRef.current.remove(loadedRobotRef.current);
      }
      loadedRobotRef.current = null;
    };
  }, [
    isActive,
    manager,
    robot.displayName,
    robot.visual.orderedUrdfJointNames,
    robot.visual.urdfUrl,
  ]);

  useEffect(() => {
    const loadedRobot = loadedRobotRef.current;
    if (!loadedRobot || !manager) return;

    const jointNames = manager.getOrderedJointNames();
    applyJointAngles(loadedRobot, jointNames, angles);
  }, [angles, manager]);

  const origin = robot.visual.origin;

  return (
    <group ref={groupRef} position={[origin.x, origin.y, origin.z]}>
      {isActive && <axesHelper args={[0.3]} />}
    </group>
  );
}

export default function Viewport({ sceneState }: ViewportProps) {
  const { robots, activeRobotId, activeRobot } = useRobotControl();
  const renderableRobots = useMemo(
    () => robots.filter((robot) => robot.visual.urdfUrl),
    [robots],
  );

  return (
    <div className="relative h-full w-full">
      {sceneState.settings.stats && (
        <div className="absolute left-0 top-0 z-10">
          <StatsOverlay />
        </div>
      )}

      <Canvas camera={{ position: [2.5, 1.6, -3.2], up: [0, 1, 0], fov: 50 }}>
        {sceneState.settings.environment ? (
          <>
            <ambientLight intensity={1.4} />
            <directionalLight position={[5, 10, 7.5]} intensity={1.2} />
            <hemisphereLight
              intensity={0.5}
              color={new THREE.Color("#dbeafe")}
              groundColor={new THREE.Color("#1f2937")}
            />
            <Suspense fallback={null}>
              <Environment preset="city" />
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

        <color attach="background" args={["#202025"]} />
        <OrbitControls />

        {renderableRobots.map((robot) => (
          <ViewportRobot
            key={robot.robotId}
            robot={robot}
            isActive={robot.robotId === activeRobotId}
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
