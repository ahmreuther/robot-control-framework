import { describe, expect, it } from 'vitest';

import {
  createJointStateManager,
  JOINT_SOURCE_ID,
  JOINT_SOURCE_PRIORITY,
} from './jointStateManager';

describe('createJointStateManager', () => {
  it('starts with empty angles and no active source', () => {
    const manager = createJointStateManager();

    expect(manager.getAngles()).toEqual([]);
    expect(manager.getActiveSource()).toBe(null);
  });

  it('auto-activates the highest priority mounted source', () => {
    const manager = createJointStateManager();

    manager.mountSource(JOINT_SOURCE_ID.FK, JOINT_SOURCE_PRIORITY.FK);
    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.FK);
    manager.mountSource(JOINT_SOURCE_ID.IK, JOINT_SOURCE_PRIORITY.IK);
    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.IK);

    expect(manager.updateFromSource(JOINT_SOURCE_ID.DRAG, [1, 2, 3])).toBe(false);
    expect(manager.updateFromSource(JOINT_SOURCE_ID.IK, [0.1, 0.2, 0.3])).toBe(true);
    expect(manager.getAngles()).toEqual([0.1, 0.2, 0.3]);
  });

  it('falls back to the next highest priority source on unmount', () => {
    const manager = createJointStateManager();

    manager.mountSource(JOINT_SOURCE_ID.FK, JOINT_SOURCE_PRIORITY.FK);
    manager.mountSource(JOINT_SOURCE_ID.DRAG, JOINT_SOURCE_PRIORITY.DRAG);
    manager.unmountSource(JOINT_SOURCE_ID.DRAG);

    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.FK);
  });

  it('notifies and unsubscribes listeners', () => {
    const manager = createJointStateManager();
    const seen: number[][] = [];

    const unsubscribe = manager.subscribe((snapshot) => seen.push(snapshot.angles));
    manager.mountSource(JOINT_SOURCE_ID.SYNC, JOINT_SOURCE_PRIORITY.SYNC);
    manager.updateFromSource(JOINT_SOURCE_ID.SYNC, [1]);
    unsubscribe();
    manager.updateFromSource(JOINT_SOURCE_ID.SYNC, [2]);

    expect(seen.at(-1)).toEqual([1]);
  });

  it('rejects activating an unmounted source', () => {
    const manager = createJointStateManager();

    expect(manager.setActiveSource(JOINT_SOURCE_ID.SYNC)).toBe(false);
    expect(manager.getActiveSource()).toBe(null);
  });

  it('rejects activating a lower priority source while a higher one is mounted', () => {
    const manager = createJointStateManager();

    manager.mountSource(JOINT_SOURCE_ID.FK, JOINT_SOURCE_PRIORITY.FK);
    manager.mountSource(JOINT_SOURCE_ID.SYNC, JOINT_SOURCE_PRIORITY.SYNC);

    expect(manager.setActiveSource(JOINT_SOURCE_ID.FK)).toBe(false);
    expect(manager.getActiveSource()?.id).toBe(JOINT_SOURCE_ID.SYNC);
  });

  it('tracks ordered joint names and indexes', () => {
    const manager = createJointStateManager();

    manager.setJointNames(['joint_1', 'joint_2']);

    expect(manager.getOrderedJointNames()).toEqual(['joint_1', 'joint_2']);
    expect(manager.getJointNameToIndexMap()).toEqual({ joint_1: 0, joint_2: 1 });
  });
});
