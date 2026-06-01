export const JOINT_SOURCE_ID = {
  RESET: "joint-reset",
  ANIMATION: "joint-animation",
  SYNC: "joint-sync",
  IK: "joint-ik",
  DRAG: "joint-drag",
  MANUAL: "joint-manual",
  FK: "joint-fk",
} as const;

export const JOINT_SOURCE_PRIORITY = {
  RESET: 6,
  ANIMATION: 5,
  SYNC: 4,
  IK: 3,
  DRAG: 2,
  MANUAL: 1,
  FK: 0,
} as const;

export type JointSourceId =
  | (typeof JOINT_SOURCE_ID)[keyof typeof JOINT_SOURCE_ID]
  | string;

export type JointType =
  | "revolute"
  | "prismatic"
  | "fixed"
  | "continuous"
  | "planar"
  | "floating";

export interface JointProperty {
  min: number;
  max: number;
  jointType: JointType;
}

export interface JointStateSource {
  id: JointSourceId;
  priority: number;
  mountedAt: number;
}

export interface JointStateSnapshot {
  angles: number[];
  activeSourceId: JointSourceId | null;
  jointNames: string[];
  jointPropertiesByName: Record<string, JointProperty | null>;
}

export type JointStateListener = (snapshot: JointStateSnapshot) => void;

export interface JointStateManager {
  mountSource(id: JointSourceId, priority: number): void;
  unmountSource(id: JointSourceId): void;
  setActiveSource(id: JointSourceId | null): boolean;
  canSourceTakeControl(id: JointSourceId, priority: number): boolean;
  updateFromSource(id: JointSourceId, angles: number[]): boolean;
  hasSource(id: JointSourceId): boolean;
  subscribe(listener: JointStateListener): () => void;
  getState(): JointStateSnapshot;
  getAngles(): number[];
  getActiveSource(): JointStateSource | null;
  setJointNames(jointNames: string[]): void;
  setJointProperties(propertiesByName: Record<string, JointProperty | null>): void;
  getOrderedJointNames(): string[];
  getJointNameToIndexMap(): Record<string, number>;
}

export function createJointStateManager(): JointStateManager {
  let angles: number[] = [];
  let activeSourceId: JointSourceId | null = null;
  let jointNames: string[] = [];
  let jointPropertiesByName: Record<string, JointProperty | null> = {};
  const sources = new Map<JointSourceId, JointStateSource>();
  const listeners = new Set<JointStateListener>();

  function chooseHighestPrioritySource(): JointStateSource | null {
    return (
      Array.from(sources.values()).sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return a.mountedAt - b.mountedAt;
      })[0] ?? null
    );
  }

  function notifyListeners() {
    for (const listener of listeners) {
      listener({
        angles: [...angles],
        activeSourceId,
        jointNames: [...jointNames],
        jointPropertiesByName: { ...jointPropertiesByName },
      });
    }
  }

  return {
    mountSource(id: JointSourceId, priority: number) {
      const existing = sources.get(id);
      if (existing) {
        existing.priority = priority;
        const nextActive = chooseHighestPrioritySource();
        activeSourceId = nextActive?.id ?? null;
        notifyListeners();
        return;
      }
      sources.set(id, {
        id,
        priority,
        mountedAt: Date.now(),
      });
      const nextActive = chooseHighestPrioritySource();
      activeSourceId = nextActive?.id ?? null;
      notifyListeners();
    },

    unmountSource(id: JointSourceId) {
      sources.delete(id);
      const nextActive = chooseHighestPrioritySource();
      activeSourceId = nextActive?.id ?? null;
      notifyListeners();
    },

    setActiveSource(id: JointSourceId | null) {
      if (id === null) {
        activeSourceId = null;
        notifyListeners();
        return true;
      }
      if (!sources.has(id)) {
        return false;
      }
      const requested = sources.get(id);
      const highest = chooseHighestPrioritySource();
      if (!requested || (highest && highest.id !== requested.id)) {
        return false;
      }
      activeSourceId = id;
      notifyListeners();
      return true;
    },

    canSourceTakeControl(id: JointSourceId, priority: number) {
      const activeSource = activeSourceId ? sources.get(activeSourceId) ?? null : null;
      if (!activeSource) {
        return true;
      }
      if (activeSource.id === id) {
        return true;
      }
      return priority >= activeSource.priority;
    },

    updateFromSource(id: JointSourceId, nextAngles: number[]) {
      if (!sources.has(id)) {
        return false;
      }
      if (activeSourceId !== id) {
        return false;
      }

      angles = [...nextAngles];
      notifyListeners();
      return true;
    },

    hasSource(id: JointSourceId) {
      return sources.has(id);
    },

    subscribe(listener: JointStateListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getState() {
      return {
        angles: [...angles],
        activeSourceId,
        jointNames: [...jointNames],
        jointPropertiesByName: { ...jointPropertiesByName },
      };
    },

    getAngles() {
      return [...angles];
    },

    getActiveSource() {
      return activeSourceId ? (sources.get(activeSourceId) ?? null) : null;
    },

    setJointNames(nextJointNames: string[]) {
      jointNames = [...nextJointNames];
      notifyListeners();
    },

    setJointProperties(nextJointPropertiesByName: Record<string, JointProperty | null>) {
      jointPropertiesByName = { ...nextJointPropertiesByName };
      notifyListeners();
    },

    getOrderedJointNames() {
      return [...jointNames];
    },

    getJointNameToIndexMap() {
      return Object.fromEntries(jointNames.map((name, index) => [name, index]));
    },
  };
}
