import { useCallback, useMemo, useState } from "react";

export const WRITER_PRIORITY = {
  RESET: 6,      // Reset
  ANIMATION: 5,  // Home pose animation
  SYN: 4,         // Synchronized motion
  IK: 3,         // Inverse kinematics
  DRAG: 2,      // Manual joint drag 
  FK: 1,         // Forward kinematic
};

export const WRITER_ID = {
  RESET: 'joint-reset',
  ANIMATION: 'joint-animation',
  SYN: 'joint-syn',
  IK: 'joint-ik',
  DRAG: 'joint-drag',
  FK: 'joint-fk',
};

type JointStateListener = (angles: number[]) => void;
type JointWriter = { id: string; priority: number };

export interface JointStateManager {
  angles: number[];
  activeWriter: JointWriter | null;
  listeners: Set<JointStateListener>;
  
  // Mount a writer
  mountWriter(id: string, priority: number): boolean;
  unmountWriter(id: string): void;
  
  // Update joint angles (only active writer can)
  setAngles(id: string, angles: number[]): boolean;
  
  // Subscribe to changes
  subscribe(listener: JointStateListener): () => void;
  
  // Read current state
  getAngles(): number[];
  getActiveWriter(): JointWriter | null;
}

const createJointStateManager = (): JointStateManager => {
  let angles: number[] = [];
  let activeWriter: JointWriter | null = null;
  const writers = new Map<string, JointWriter>();
  const listeners = new Set<JointStateListener>();

  return {
    angles,
    activeWriter,
    listeners,

    mountWriter(id: string, priority: number) {
      const newWriter: JointWriter = { id, priority };
      writers.set(id, newWriter);

      // Higher priority takes over
      if (!activeWriter || priority > activeWriter.priority) {
        activeWriter = newWriter;
        return true;
      }
      return false;
    },

    unmountWriter(id: string) {
      writers.delete(id);
      if (activeWriter?.id === id) {
        // Find next highest priority writer
        activeWriter = Array.from(writers.values()).sort(
          (a, b) => b.priority - a.priority
        )[0] ?? null;
      }
    },

    setAngles(id: string, angles: number[]) {
      if (activeWriter?.id !== id) return false;
      
      this.angles = angles;
      listeners.forEach(listener => listener(angles));
      return true;
    },

    subscribe(listener: JointStateListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getAngles() {
      return this.angles;
    },

    getActiveWriter() {
      return activeWriter;
    },
  };
};

export const useJointState = () => {
  const [manager] = useState(() => createJointStateManager());
  return manager;
};