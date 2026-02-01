import { useCallback, useMemo, useState } from "react";
import type { ModelConfig } from "../components/MenuComponents/ControlsComponents/URDFSelector";

const ROBOT_MODELS: ModelConfig[] = [
  { id: 'eva', label: 'EVA Automata', url: '/urdf/eva_description/urdf/eva_description.urdf' },
  { id: 'fr3', label: 'Franka Research 3', url: '/urdf/fr3_description/urdf/fr3.urdf' },
  { id: 'fr3_wagon', label: 'Franka Research 3 with Wagon', url: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf' },
  { id: 'ur5e', label: 'UR5e', url: '/urdf/ur5_description/urdf/ur5_robot.urdf' },
];

export type JointType = 'revolute' | 'prismatic' | 'fixed' | 'continuous' | 'planar' | 'floating';

export interface JointProperty {
  min: number;
  max: number;
  jointType: JointType;
}

export interface UseSceneStateOptions {
  initialShowCollisionMesh?: boolean;
  initialJointLimits?: Array<JointProperty | null>;
}

export interface SceneStateApi {
  options: ModelConfig[];
  showCollisionMesh: boolean;
  setShowCollisionMesh: (visible: boolean) => void;
  jointProperties: Array<JointProperty | null>;
  setJointLimits: (limits: Array<JointProperty | null>) => void;
  updateJointLimit: (index: number, limit: JointProperty | null) => void;
  selectedRobot: ModelConfig | null;
  setSelectedRobot: (robot: ModelConfig) => void;
  reloadKey: number;
  handleRobotSelect: (robot: ModelConfig) => void;
  hoveredJointMesh: number | null;
  setHoveredJointMesh: (index: number | null) => void;
}

export function useSceneState(): SceneStateApi {
  const { 
    initialShowCollisionMesh = false, 
    initialJointLimits = []
  } = {};

  const [showCollisionMesh, setShowCollisionMesh] = useState<boolean>(initialShowCollisionMesh);
  const [jointProperties, setJointLimits] = useState<Array<JointProperty | null>>(initialJointLimits);
  const [selectedRobot, setSelectedRobot] = useState<ModelConfig>(ROBOT_MODELS[0]);
  const [reloadKey, setReloadKey] = useState(0);
  const [hoveredJointMesh, setHoveredJointMesh] = useState<number | null>(null);

  const updateJointLimit = useCallback((index: number, limit: JointProperty | null) => {
    setJointLimits(prev => {
      const updated = [...prev];
      updated[index] = limit;
      return updated;
    });
  }, []);

  const handleRobotSelect = useCallback((robot: ModelConfig) => {
    setSelectedRobot(robot);
    setReloadKey(prev => prev + 1);
  }, []);

  return useMemo(
    () => ({
      options: ROBOT_MODELS,
      showCollisionMesh,
      setShowCollisionMesh,
      jointProperties,
      setJointLimits,
      updateJointLimit,
      selectedRobot,
      setSelectedRobot,
      reloadKey,
      handleRobotSelect,
      hoveredJointMesh,
      setHoveredJointMesh,
    }),
    [showCollisionMesh, jointProperties, updateJointLimit, selectedRobot, reloadKey, handleRobotSelect, hoveredJointMesh]
  );
}
