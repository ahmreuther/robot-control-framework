import { useCallback, useMemo, useState } from "react";
import type { ModelConfig } from "../components/MenuComponents/ControlsComponents/URDFSelector";

const ROBOT_MODELS: ModelConfig[] = [
  { id: 'eva', label: 'EVA Automata', url: '/urdf/eva_description/urdf/eva_description.urdf' },
  { id: 'fr3', label: 'Franka Research 3', url: '/urdf/fr3_description/urdf/fr3.urdf' },
  { id: 'fr3_wagon', label: 'Franka Research 3 with Wagon', url: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf' },
  { id: 'ur5e', label: 'UR5e', url: '/urdf/ur5_description/urdf/ur5_robot.urdf' },
];

export interface JointLimit {
  min: number;
  max: number;
}

export interface UseSceneStateOptions {
  initialShowCollisionMesh?: boolean;
  initialJointLimits?: Array<JointLimit | null>;
}

export interface SceneStateApi {
  options: ModelConfig[];
  showCollisionMesh: boolean;
  setShowCollisionMesh: (visible: boolean) => void;
  jointLimits: Array<JointLimit | null>;
  setJointLimits: (limits: Array<JointLimit | null>) => void;
  updateJointLimit: (index: number, limit: JointLimit | null) => void;
  selectedRobot: ModelConfig | null;
  setSelectedRobot: (robot: ModelConfig) => void;
  reloadKey: number;
  handleRobotSelect: (robot: ModelConfig, onFkModeChange?: (mode: boolean) => void) => void;
}

export function useSceneState(): SceneStateApi {
  const { 
    initialShowCollisionMesh = false, 
    initialJointLimits = []
  } = {};

  const [showCollisionMesh, setShowCollisionMesh] = useState<boolean>(initialShowCollisionMesh);
  const [jointLimits, setJointLimits] = useState<Array<JointLimit | null>>(initialJointLimits);
  const [selectedRobot, setSelectedRobot] = useState<ModelConfig>(ROBOT_MODELS[0]);
  const [reloadKey, setReloadKey] = useState(0);

  const updateJointLimit = useCallback((index: number, limit: JointLimit | null) => {
    setJointLimits(prev => {
      const updated = [...prev];
      updated[index] = limit;
      return updated;
    });
  }, []);

  const handleRobotSelect = useCallback((robot: ModelConfig, onFkModeChange?: (mode: boolean) => void) => {
    onFkModeChange?.(false);
    setSelectedRobot(robot);
    setReloadKey(prev => prev + 1);
  }, []);

  return useMemo(
    () => ({
      options: ROBOT_MODELS,
      showCollisionMesh,
      setShowCollisionMesh,
      jointLimits,
      setJointLimits,
      updateJointLimit,
      selectedRobot,
      setSelectedRobot,
      reloadKey,
      handleRobotSelect,
    }),
    [showCollisionMesh, jointLimits, updateJointLimit, selectedRobot, reloadKey, handleRobotSelect]
  );
}
