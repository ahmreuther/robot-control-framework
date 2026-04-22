export const JOINT_WRITER_PRIORITY = {
  RESET: 6,
  ANIMATION: 5,
  SYN: 4,
  IK: 3,
  DRAG: 2,
  FK: 1,
} as const;

export const JOINT_WRITER_ID = {
  RESET: 'joint-reset',
  ANIMATION: 'joint-animation',
  SYN: 'joint-syn',
  IK: 'joint-ik',
  DRAG: 'joint-drag',
  FK: 'joint-fk',
} as const;

export type JointWriterId = (typeof JOINT_WRITER_ID)[keyof typeof JOINT_WRITER_ID] | string;
export type JointStateListener = (angles: number[]) => void;

export interface JointWriter {
  id: JointWriterId;
  priority: number;
}

export interface JointStateManager {
  mountWriter(id: JointWriterId, priority: number): boolean;
  unmountWriter(id: JointWriterId): void;
  setAngles(id: JointWriterId, angles: number[]): boolean;
  subscribe(listener: JointStateListener): () => void;
  getAngles(): number[];
  getActiveWriter(): JointWriter | null;
  setJointNames(jointNames: string[]): void;
  getOrderedJointNames(): string[];
  getJointNameToIndexMap(): Record<string, number>;
}

export function createJointStateManager(): JointStateManager {
  let angles: number[] = [];
  let activeWriter: JointWriter | null = null;
  let jointNames: string[] = [];
  const writers = new Map<JointWriterId, JointWriter>();
  const listeners = new Set<JointStateListener>();

  function nextHighestWriter(): JointWriter | null {
    return Array.from(writers.values()).sort((a, b) => b.priority - a.priority)[0] ?? null;
  }

  return {
    mountWriter(id: JointWriterId, priority: number) {
      const writer = { id, priority };
      writers.set(id, writer);

      if (!activeWriter || priority > activeWriter.priority) {
        activeWriter = writer;
        return true;
      }
      return false;
    },

    unmountWriter(id: JointWriterId) {
      writers.delete(id);
      if (activeWriter?.id === id) {
        activeWriter = nextHighestWriter();
      }
    },

    setAngles(id: JointWriterId, nextAngles: number[]) {
      if (activeWriter?.id !== id) return false;

      angles = [...nextAngles];
      for (const listener of listeners) {
        listener([...angles]);
      }
      return true;
    },

    subscribe(listener: JointStateListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getAngles() {
      return [...angles];
    },

    getActiveWriter() {
      return activeWriter;
    },

    setJointNames(nextJointNames: string[]) {
      jointNames = [...nextJointNames];
    },

    getOrderedJointNames() {
      return [...jointNames];
    },

    getJointNameToIndexMap() {
      return Object.fromEntries(jointNames.map((name, index) => [name, index]));
    },
  };
}
