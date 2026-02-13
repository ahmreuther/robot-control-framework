import { act,renderHook } from '@testing-library/react';
import { beforeEach,describe, expect, it } from 'vitest';

import { useJointState, WRITER_ID,WRITER_PRIORITY } from './useJointState';

describe('useJointState', () => {
  it('should initialize with empty angles and no active writer', () => {
    const { result } = renderHook(() => useJointState());

    expect(result.current.getAngles()).toEqual([]);
    expect(result.current.getActiveWriter()).toBeNull();
  });

  it('should mount a writer and make it active', () => {
    const { result } = renderHook(() => useJointState());

    act(() => {
      const success = result.current.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);
      expect(success).toBe(true);
    });

    const activeWriter = result.current.getActiveWriter();
    expect(activeWriter).not.toBeNull();
    expect(activeWriter?.id).toBe(WRITER_ID.FK);
    expect(activeWriter?.priority).toBe(WRITER_PRIORITY.FK);
  });

  it('should give priority to higher priority writer', () => {
    const { result } = renderHook(() => useJointState());

    act(() => {
      result.current.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);
      const success = result.current.mountWriter(WRITER_ID.IK, WRITER_PRIORITY.IK);
      expect(success).toBe(true);
    });

    const activeWriter = result.current.getActiveWriter();
    expect(activeWriter?.id).toBe(WRITER_ID.IK);
  });

  it('should not switch to lower priority writer', () => {
    const { result } = renderHook(() => useJointState());

    act(() => {
      result.current.mountWriter(WRITER_ID.IK, WRITER_PRIORITY.IK);
      const success = result.current.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);
      expect(success).toBe(false);
    });

    const activeWriter = result.current.getActiveWriter();
    expect(activeWriter?.id).toBe(WRITER_ID.IK);
  });

  it('should allow active writer to set angles', () => {
    const { result } = renderHook(() => useJointState());
    const testAngles = [0.1, 0.2, 0.3];

    act(() => {
      result.current.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);
      const success = result.current.setAngles(WRITER_ID.FK, testAngles);
      expect(success).toBe(true);
    });

    expect(result.current.getAngles()).toEqual(testAngles);
  });

  it('should not allow inactive writer to set angles', () => {
    const { result } = renderHook(() => useJointState());
    const testAngles = [0.1, 0.2, 0.3];

    act(() => {
      result.current.mountWriter(WRITER_ID.IK, WRITER_PRIORITY.IK);
      result.current.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);
      const success = result.current.setAngles(WRITER_ID.FK, testAngles);
      expect(success).toBe(false);
    });

    expect(result.current.getAngles()).toEqual([]);
  });

  it('should notify listeners when angles change', () => {
    const { result } = renderHook(() => useJointState());
    const testAngles = [0.1, 0.2, 0.3];
    let notifiedAngles: number[] = [];

    act(() => {
      result.current.subscribe((angles) => {
        notifiedAngles = angles;
      });
      result.current.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);
      result.current.setAngles(WRITER_ID.FK, testAngles);
    });

    expect(notifiedAngles).toEqual(testAngles);
  });

  it('should unsubscribe listener correctly', () => {
    const { result } = renderHook(() => useJointState());
    const testAngles = [0.1, 0.2, 0.3];
    let callCount = 0;
    let unsubscribe: () => void;

    act(() => {
      unsubscribe = result.current.subscribe(() => {
        callCount++;
      });
      result.current.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);
      result.current.setAngles(WRITER_ID.FK, testAngles);
    });

    expect(callCount).toBe(1);

    act(() => {
      unsubscribe();
      result.current.setAngles(WRITER_ID.FK, [0.4, 0.5, 0.6]);
    });

    expect(callCount).toBe(1); // Should not increment
  });

  it('should switch to next highest priority writer when active unmounts', () => {
    const { result } = renderHook(() => useJointState());

    act(() => {
      result.current.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);
      result.current.mountWriter(WRITER_ID.DRAG, WRITER_PRIORITY.DRAG);
      result.current.mountWriter(WRITER_ID.IK, WRITER_PRIORITY.IK);
    });

    expect(result.current.getActiveWriter()?.id).toBe(WRITER_ID.IK);

    act(() => {
      result.current.unmountWriter(WRITER_ID.IK);
    });

    expect(result.current.getActiveWriter()?.id).toBe(WRITER_ID.DRAG);

    act(() => {
      result.current.unmountWriter(WRITER_ID.DRAG);
    });

    expect(result.current.getActiveWriter()?.id).toBe(WRITER_ID.FK);
  });

  it('should have no active writer when all unmount', () => {
    const { result } = renderHook(() => useJointState());

    act(() => {
      result.current.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);
      result.current.unmountWriter(WRITER_ID.FK);
    });

    expect(result.current.getActiveWriter()).toBeNull();
  });

  it('should handle reset writer with highest priority', () => {
    const { result } = renderHook(() => useJointState());

    act(() => {
      result.current.mountWriter(WRITER_ID.IK, WRITER_PRIORITY.IK);
      result.current.mountWriter(WRITER_ID.ANIMATION, WRITER_PRIORITY.ANIMATION);
      const success = result.current.mountWriter(WRITER_ID.RESET, WRITER_PRIORITY.RESET);
      expect(success).toBe(true);
    });

    expect(result.current.getActiveWriter()?.id).toBe(WRITER_ID.RESET);
  });

  it('should maintain stable manager instance across re-renders', () => {
    const { result, rerender } = renderHook(() => useJointState());
    const firstManager = result.current;

    rerender();

    expect(result.current).toBe(firstManager);
  });
});
