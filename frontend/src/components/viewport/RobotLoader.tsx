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

        const applyEvaHomePose = (evaRobot: URDFRobot | null) => {
            if (!evaRobot) return;
            const name = (evaRobot.robotName || evaRobot.name || "").toLowerCase();
            if (!name.includes("eva_description")) return;

            const jointNames = Object.keys(evaRobot.joints ?? {});
            if (!jointNames.length) return;
            const degToRad = (deg: number) => (deg * Math.PI) / 180;
            const setJoint = (index: number, value: number) => {
                const jointName = jointNames[index];
                if (jointName) {
                    evaRobot.setJointValue(jointName, value);
                }
            };

            setJoint(1, 0);
            setJoint(2, degToRad(-90));
            setJoint(3, 0);
            setJoint(4, degToRad(-90));
            setJoint(5, 0);
            evaRobot.updateMatrixWorld(true);
        };

        loader.load(url, (loadedRobot) => {
            robot = loadedRobot;

            // Wrap robot in a group (no rotation needed - scene is Z-up)
            robotGroup = new THREE.Group();
            robotGroup.add(robot);
            
            // Add axis helper to visualize robot orientation
            const axesHelper = new THREE.AxesHelper(0.5);
            robotGroup.add(axesHelper);

            applyEvaHomePose(robot);
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
    }, [url, scene]);

    return null;
};

export default RobotLoader;