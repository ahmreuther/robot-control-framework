import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import URDFLoader from "urdf-loader";
import type { URDFRobot } from "urdf-loader/src/URDFClasses";

export interface RobotLoaderProps {
    urdfPath: string;
    onRobotReady?: (robot: URDFRobot, robotGroup: THREE.Group) => void;
}

const RobotLoader = ({ urdfPath, onRobotReady }: RobotLoaderProps) => {
    const url = urdfPath;
    const { scene } = useThree();
    const robotRef = useRef<any | null>(null);
    const groupRef = useRef<THREE.Group | null>(null);

    useEffect(() => {
        const manager = new THREE.LoadingManager();
        const loader = new URDFLoader(manager);
        let robot: URDFRobot  | null = null;
        let robotGroup: THREE.Group | null = null;

        loader.load(url, (loadedRobot) => {
            robot = loadedRobot;

            // Wrap robot in a group (no rotation needed - scene is Z-up)
            robotGroup = new THREE.Group();
            robotGroup.add(robot);

            scene.add(robotGroup);
            robotRef.current = robot;
            groupRef.current = robotGroup;
            if (onRobotReady) {
                onRobotReady(robot, robotGroup);
            }
        });

        return () => {
            if (robotGroup) {
                scene.remove(robotGroup);
            }
            if (robotRef.current === robot) {
                robotRef.current = null;
            }
        };
    }, [url, scene, onRobotReady]);

    return null;
};

export default RobotLoader;