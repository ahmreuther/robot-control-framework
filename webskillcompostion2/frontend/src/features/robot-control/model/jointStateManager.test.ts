import { describe, expect, it } from 'vitest';

import {
  createJointStateManager,
  JOINT_WRITER_ID,
  JOINT_WRITER_PRIORITY,
} from './jointStateManager';

describe('createJointStateManager', () => {
  it('starts with empty angles and no active writer', () => {
    const manager = createJointStateManager();

    expect(manager.getAngles()).toEqual([]);
    expect(manager.getActiveWriter()).toBe(null);
  });

  it('lets the highest priority writer control angles', () => {
    const manager = createJointStateManager();

    expect(manager.mountWriter(JOINT_WRITER_ID.FK, JOINT_WRITER_PRIORITY.FK)).toBe(true);
    expect(manager.mountWriter(JOINT_WRITER_ID.IK, JOINT_WRITER_PRIORITY.IK)).toBe(true);
    expect(manager.mountWriter(JOINT_WRITER_ID.DRAG, JOINT_WRITER_PRIORITY.DRAG)).toBe(false);

    expect(manager.setAngles(JOINT_WRITER_ID.DRAG, [1, 2, 3])).toBe(false);
    expect(manager.setAngles(JOINT_WRITER_ID.IK, [0.1, 0.2, 0.3])).toBe(true);
    expect(manager.getAngles()).toEqual([0.1, 0.2, 0.3]);
  });

  it('falls back to next highest writer when active writer unmounts', () => {
    const manager = createJointStateManager();

    manager.mountWriter(JOINT_WRITER_ID.FK, JOINT_WRITER_PRIORITY.FK);
    manager.mountWriter(JOINT_WRITER_ID.DRAG, JOINT_WRITER_PRIORITY.DRAG);
    manager.mountWriter(JOINT_WRITER_ID.IK, JOINT_WRITER_PRIORITY.IK);
    manager.unmountWriter(JOINT_WRITER_ID.IK);

    expect(manager.getActiveWriter()?.id).toBe(JOINT_WRITER_ID.DRAG);
  });

  it('notifies and unsubscribes listeners', () => {
    const manager = createJointStateManager();
    const seen: number[][] = [];

    const unsubscribe = manager.subscribe((angles) => seen.push(angles));
    manager.mountWriter(JOINT_WRITER_ID.SYN, JOINT_WRITER_PRIORITY.SYN);
    manager.setAngles(JOINT_WRITER_ID.SYN, [1]);
    unsubscribe();
    manager.setAngles(JOINT_WRITER_ID.SYN, [2]);

    expect(seen).toEqual([[1]]);
  });

  it('tracks ordered joint names and indexes', () => {
    const manager = createJointStateManager();

    manager.setJointNames(['joint_1', 'joint_2']);

    expect(manager.getOrderedJointNames()).toEqual(['joint_1', 'joint_2']);
    expect(manager.getJointNameToIndexMap()).toEqual({ joint_1: 0, joint_2: 1 });
  });
});
