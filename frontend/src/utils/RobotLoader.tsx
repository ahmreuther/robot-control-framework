import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import URDFLoader from "urdf-loader";
export interface RobotLoaderProps {
    urdfPath: string;
}

const RobotLoader = ({ urdfPath }: RobotLoaderProps) => {
    const url = urdfPath;
    const { scene } = useThree();
    const robotRef = useRef<any | null>(null);
    
    const jointPositions = useRef([0, 0, 0, 0, 0, 0]);

{/*
    useEffect(() => {
        const socket = new WebSocket("ws://localhost:5173/api/robotstate/monitor"); // Update with your WebSocket endpoint

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            jointPositions.current = data["Joint Position"];

            // Negate the joint positions to match the URDF
            jointPositions.current = jointPositions.current.map(value => -value);
        };

        socket.onopen = () => {
            console.log("Robot State WebSocket Connected");
        };

        socket.onclose = () => {
            console.log("Robot State WebSocket Disconnected");
        };

        return () => {
            socket.close();
        };
    }, []);
*/}


    useEffect(() => {
        const manager = new THREE.LoadingManager();
        const loader = new URDFLoader(manager);
        let robot: THREE.Object3D | null = null;

        loader.load(url, (loadedRobot) => {
            robot = loadedRobot;

            // Rotate the robot
            robot.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / -2);

            // Scale the robot
            robot.scale.set(1, 1, 1);

            scene.add(robot);

            robotRef.current = robot;
        });

        return () => {
            if (robot) {
                scene.remove(robot);
            }
        };
    }, [url, scene]);

    useFrame(() => {
        if (robotRef.current) {
            const joints = ["BJ", "SJ", "EJ", "W1J", "W2J", "W3J"];
            joints.forEach((joint, index) => {
                const jointObj = robotRef.current!.getObjectByName(joint);
                if (jointObj) {
                    jointObj.rotation.z = jointPositions.current[index];
                }
            });
        }
    });

    return null;
};

export default RobotLoader;