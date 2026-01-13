import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import URDFLoader from "urdf-loader";
import type { URDFRobot } from "urdf-loader/src/URDFClasses";
import type { JointLimit } from "../../hooks/useSceneState";

export interface RobotLoaderProps {
    urdfPath: string;
    onRobotReady?: (robot: URDFRobot, robotGroup: THREE.Group, jointLimits: Array<JointLimit | null>) => void;
    showCollisionMesh: boolean;
    setCollisionMeshes?: (meshes: THREE.Mesh[]) => void;
}

const RobotLoader = ({ urdfPath, onRobotReady, showCollisionMesh, setCollisionMeshes }: RobotLoaderProps) => {
    const url = urdfPath;
    const { scene } = useThree();
    const robotRef = useRef<any | null>(null);
    const groupRef = useRef<THREE.Group | null>(null);

    useEffect(() => {
        const manager = new THREE.LoadingManager();
        const loader = new URDFLoader(manager);
        // Set loader to load collision or visual meshes
        loader.parseCollision = false;
        loader.parseVisual = true;
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

            // Extract joint limits from the loaded robot
            const jointLimits: Array<JointLimit | null> = [];
            if (robot.joints) {
                Object.values(robot.joints).forEach((joint) => {
                    const limit = (joint as any).limit;
                    if (limit) {
                        jointLimits.push({
                            min: limit.lower ?? -Math.PI,
                            max: limit.upper ?? Math.PI,
                        });
                    } else {
                        jointLimits.push(null);
                    }
                });
            }

            if (onRobotReady) {
                onRobotReady(robot, robotGroup, jointLimits);
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
}

export default RobotLoader