import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import URDFLoader from "urdf-loader";
import type { URDFRobot } from "urdf-loader/src/URDFClasses";

export interface RobotLoaderProps {
    urdfPath: string;
    onRobotReady?: (robot: URDFRobot, robotGroup: THREE.Group) => void;
    showAxisHelpers?: boolean;
}

const RobotLoader = ({ urdfPath, onRobotReady, showAxisHelpers = true }: RobotLoaderProps) => {
    const url = urdfPath;
    const { scene } = useThree();
    const robotRef = useRef<any | null>(null);
    const groupRef = useRef<THREE.Group | null>(null);
    const axisHelpersRef = useRef<THREE.AxesHelper[]>([]);

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
            
            // Add axis helper to visualize robot orientation
            const axesHelper = new THREE.AxesHelper(0.5);
            axesHelper.visible = showAxisHelpers;
            robotGroup.add(axesHelper);
            axisHelpersRef.current.push(axesHelper);
            
            // Add axis helpers to each joint
            robot.traverse((obj: any) => {
                if (obj.isURDFJoint && obj.jointType !== 'fixed') {
                    const jointAxes = new THREE.AxesHelper(0.1);
                    jointAxes.visible = showAxisHelpers;
                    obj.add(jointAxes);
                    axisHelpersRef.current.push(jointAxes);
                }
            });

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
    
    // Toggle axis helpers visibility
    useEffect(() => {
        axisHelpersRef.current.forEach((helper) => {
            helper.visible = showAxisHelpers;
        });
    }, [showAxisHelpers]);

    return null;
};

export default RobotLoader;