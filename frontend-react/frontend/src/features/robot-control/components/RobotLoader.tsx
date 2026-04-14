import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { URDFRobot } from 'urdf-loader/src/URDFClasses';

import URDFLoader from './URDFLoader';

export interface RobotLoaderProps {
  urdfPath: string;
  onRobotReady?: (robot: URDFRobot, robotGroup: THREE.Group) => void;
}

const RobotLoader = ({ urdfPath, onRobotReady }: RobotLoaderProps) => {
  const url = urdfPath;
  const { scene } = useThree();
  const robotRef = useRef<any | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const onRobotReadyRef = useRef(onRobotReady);

  useEffect(() => {
    onRobotReadyRef.current = onRobotReady;
  }, [onRobotReady]);

  useEffect(() => {
    if (!url) return;

    // Remove previously loaded robot group before loading a new model.
    if (groupRef.current) {
      scene.remove(groupRef.current);
      groupRef.current = null;
    }
    robotRef.current = null;

    const manager = new THREE.LoadingManager();
    manager.onLoad = () => {
      if (robot && robotGroup) {
        onRobotReadyRef.current?.(robot, robotGroup);
      }
    };
    const loader = new URDFLoader(manager);
    loader.parseCollision = true;
    loader.parseVisual = true;

    let robot: URDFRobot | null = null;
    let robotGroup: THREE.Group | null = null;

    loader.load(url, (loadedRobot) => {
      robot = loadedRobot;
      robotGroup = new THREE.Group();
      robotGroup.add(robot);

      scene.add(robotGroup);
      robotRef.current = robot;
      groupRef.current = robotGroup;
    });

    return () => {
      if (groupRef.current) {
        scene.remove(groupRef.current);
        groupRef.current = null;
      }
      robotRef.current = null;
    };
  }, [url, scene]);

  return null;
};

export default RobotLoader;
