import { create } from 'zustand';
import * as THREE from 'three';

export type ModelConfig = {
  id: string;
  label: string;
  url: string;
};

type SceneState = {
  models: ModelConfig[];
  currentModelId: string;

  setCurrentModel: (id: string) => void;
};

export const useSceneStore = create<SceneState>((set) => ({
  models: [
    { id: 'eva', label: 'EVA Automata', url: '/urdf/eva_description/urdf/eva_description.urdf' },
    { id: 'fr3', label: 'Franka Research 3', url: '/urdf/fr3_description/urdf/fr3.urdf' },
    { id: 'fr3_wagon', label: 'Franka Research 3 with Wagon', url: '/urdf/fr3_description_with_wagon/urdf/fr3.urdf' },
    { id: 'ur5e', label: 'UR5e', url: '/urdf/ur5_description/urdf/ur5_robot.urdf' },
  ],
  currentModelId: 'robot',
  setCurrentModel: (id) => set({ currentModelId: id }),
}));
