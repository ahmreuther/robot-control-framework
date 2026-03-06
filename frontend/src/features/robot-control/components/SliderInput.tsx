import { useCallback, useEffect, useRef, useState } from 'react';

import type { JointStateManager } from '../hooks/useJointState';
import { WRITER_ID, WRITER_PRIORITY } from '../hooks/useJointState';
import type { JointProperty } from '../hooks/useSceneState';
import { useSyncContext } from '../contexts/SyncContext';

const GOAL_MARKER_MOUSEUP_HOVERED_EVENT = 'goal-marker:mouseup-hovered';

export interface SliderProps {
  minDisp: number;
  maxDisp: number;
  valueDisp: number;
  i: number;
  property?: JointProperty;
  jointManager: JointStateManager;
  localAngles: number[];
  setLocalAngles: (angles: number[]) => void;
  showRadians: boolean;
  radToDeg: (rad: number) => number;
  degToRad: (deg: number) => number;
  setPendingJoints: (joints: number[]) => void;
}

export function SliderInput({
  minDisp,
  maxDisp,
  valueDisp,
  i,
  property,
  jointManager,
  localAngles,
  setLocalAngles,
  showRadians,
  radToDeg,
  degToRad,
  setPendingJoints,
}: SliderProps) {
  let minDispLocal = minDisp;
  let maxDispLocal = maxDisp;
  let valueDispLocal = valueDisp;
  let stepDisp: number;
  const { isSyncActive } = useSyncContext();
  const angle = localAngles[i];
  if (property?.jointType === 'prismatic') {
    minDispLocal = (property.min ?? 0) * 1000;
    maxDispLocal = (property.max ?? 1) * 1000;
    valueDispLocal = angle * 1000;
    const range = maxDispLocal - minDispLocal;
    stepDisp = Math.max(range / 100, 0.01); // mm
  } else {
    const minRad = property ? property.min : -Math.PI;
    const maxRad = property ? property.max : Math.PI;
    const range = showRadians ? maxRad - minRad : radToDeg(maxRad) - radToDeg(minRad);
    minDispLocal = showRadians ? minRad : radToDeg(minRad);
    maxDispLocal = showRadians ? maxRad : radToDeg(maxRad);
    valueDispLocal = showRadians ? angle : radToDeg(angle);
    stepDisp = showRadians ? Math.max(range / 100, 0.001) : Math.max(range / 100, 0.1);
  }

  const [inputValue, setInputValue] = useState(() =>
    property?.jointType === 'prismatic'
      ? valueDispLocal.toFixed(2)
      : showRadians
        ? valueDispLocal.toFixed(2)
        : valueDispLocal.toFixed(1),
  );

  const [isEditing, setIsEditing] = useState(false);
  const [isSliderDragging, setIsSliderDragging] = useState(false);
  const [isAbortAreaHovered, setIsAbortAreaHovered] = useState(false);
  const abortAreaRef = useRef<HTMLDivElement | null>(null);
  const isAbortAreaHoveredRef = useRef(false);
  const lastPointerClientRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const formatted =
      property?.jointType === 'prismatic'
        ? valueDispLocal.toFixed(2)
        : showRadians
          ? valueDispLocal.toFixed(2)
          : valueDispLocal.toFixed(1);
    setInputValue(formatted);
  }, [valueDispLocal, property?.jointType, showRadians]);

  useEffect(() => {
    if (isSyncActive && isSliderDragging) return;
    isAbortAreaHoveredRef.current = false;
    setIsAbortAreaHovered(false);
  }, [isSyncActive, isSliderDragging]);

  const isPointInsideAbortArea = useCallback((x: number, y: number) => {
    const rect = abortAreaRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }, []);

  const syncAbortHoverState = useCallback(
    (x: number, y: number) => {
      const isInside = isPointInsideAbortArea(x, y);
      if (isAbortAreaHoveredRef.current === isInside) return;
      isAbortAreaHoveredRef.current = isInside;
      setIsAbortAreaHovered(isInside);
    },
    [isPointInsideAbortArea],
  );

  useEffect(() => {
    const updatePointer = (event: PointerEvent) => {
      lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
      if (isSyncActive && isSliderDragging) {
        syncAbortHoverState(event.clientX, event.clientY);
      }
    };
    window.addEventListener('pointerdown', updatePointer, true);
    window.addEventListener('pointermove', updatePointer, true);
    window.addEventListener('pointerup', updatePointer, true);
    return () => {
      window.removeEventListener('pointerdown', updatePointer, true);
      window.removeEventListener('pointermove', updatePointer, true);
      window.removeEventListener('pointerup', updatePointer, true);
    };
  }, [isSyncActive, isSliderDragging, syncAbortHoverState]);

  useEffect(() => {
    if (!isSyncActive || !isSliderDragging) return;
    const pointer = lastPointerClientRef.current;
    if (!pointer) return;
    syncAbortHoverState(pointer.x, pointer.y);
  }, [isSyncActive, isSliderDragging, syncAbortHoverState]);

  useEffect(() => {
    if (!isEditing) return;
    jointManager.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);
    if (isSyncActive) {
      jointManager.unmountWriter(WRITER_ID.SYN);
      // sendMessage('cancel stream joint position');
      // sendMessage('cancel stream mode');
    }
    const handleEnd = () => {
      // Unmount SYN writer if sync is active (method call will be triggered)
      if (isSyncActive) {
        const pointer = lastPointerClientRef.current;
        const isPointerInsideAbortArea =
          !!pointer && isPointInsideAbortArea(pointer.x, pointer.y);
        if (isAbortAreaHoveredRef.current || isPointerInsideAbortArea) {
          window.dispatchEvent(new Event(GOAL_MARKER_MOUSEUP_HOVERED_EVENT));
        }
        setPendingJoints(localAngles);
      }
      setIsSliderDragging(false);
      jointManager.unmountWriter(WRITER_ID.FK);
      setIsEditing(false);
    };
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchend', handleEnd);
      jointManager.unmountWriter(WRITER_ID.FK);
    };
  }, [localAngles, isSyncActive, isPointInsideAbortArea, jointManager, setPendingJoints]);

  const handleBeginEdit = () => setIsEditing(true);
  const handleBeginSliderDrag = () => {
    setIsSliderDragging(true);
    setIsEditing(true);
  };

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
  const applyInputValue = () => {
    if (inputValue === '' || isNaN(Number(inputValue))) return;
    let v = Number(inputValue);
    v = clamp(v, minDispLocal, maxDispLocal);
    let vForAngles = v;
    if (property?.jointType === 'prismatic') {
      vForAngles = v / 1000; // convert mm back to meters
    } else {
      vForAngles = showRadians ? v : degToRad(v);
    }
    const newAngles = [...localAngles];
    newAngles[i] = vForAngles;
    setLocalAngles(newAngles);
    jointManager.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);
    jointManager.setAngles(WRITER_ID.FK, newAngles);
    jointManager.unmountWriter(WRITER_ID.FK);
    setInputValue(
      property?.jointType === 'prismatic'
        ? v.toFixed(2)
        : showRadians
          ? v.toFixed(2)
          : v.toFixed(1),
    );
  };

  return (
    <div className="w-full hover-surface">
      {isSyncActive && isSliderDragging && (
        <div
          ref={abortAreaRef}
          onMouseEnter={() => {
            isAbortAreaHoveredRef.current = true;
            setIsAbortAreaHovered(true);
          }}
          onMouseLeave={() => {
            isAbortAreaHoveredRef.current = false;
            setIsAbortAreaHovered(false);
          }}
          onMouseUp={() => {
            window.dispatchEvent(new Event(GOAL_MARKER_MOUSEUP_HOVERED_EVENT));
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            width: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRight: isAbortAreaHovered ? '2px solid #ff3b30' : '1px dashed #ff9800',
            background: isAbortAreaHovered ? 'rgba(255,59,48,0.26)' : 'rgba(0,0,0,0.18)',
            color: isAbortAreaHovered ? '#ffebe9' : '#ffe0b2',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.3,
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            textTransform: 'uppercase',
            boxShadow: isAbortAreaHovered
              ? '0 0 0 2px rgba(255,59,48,0.3), 2px 0 12px rgba(255,59,48,0.24)'
              : '2px 0 10px rgba(0,0,0,0.2)',
            cursor: 'pointer',
            userSelect: 'none',
            zIndex: 2000,
            transition: 'all 0.15s ease',
            pointerEvents: 'auto',
          }}
        >
          Abort
        </div>
      )}
      <div className="flex mb-1">
        <div className="">
          <label className="text-xs text-white/80">JOINT {i}:</label>
        </div>
        <div className="flex-1 flex justify-end space-x-2">
          <input
            type="number"
            className="input-ghost w-16 text-right px-1 py-0"
            value={inputValue}
            min={minDispLocal}
            max={maxDispLocal}
            step={stepDisp}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={handleBeginEdit}
            onBlur={(e) => {
              applyInputValue();
              setIsEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyInputValue();
                e.currentTarget.blur();
                setIsEditing(false);
              }
            }}
          />
          <span className="text-white/60">
            {property?.jointType === 'prismatic' ? 'mm' : showRadians ? 'rad' : '°'}
          </span>
        </div>
      </div>
      <div className="block w-full py-1">
        <input
          type="range"
          className="slider w-full"
          min={minDispLocal}
          max={maxDispLocal}
          step={stepDisp}
          value={valueDispLocal}
          onMouseDown={handleBeginSliderDrag}
          onTouchStart={handleBeginSliderDrag}
          onChange={(e) => {
            let v = Number(e.target.value);
            if (property?.jointType === 'prismatic') {
              v = v / 1000; // convert mm back to meters
            } else {
              v = showRadians ? v : degToRad(v);
            }
            const newAngles = [...localAngles];
            newAngles[i] = v;
            setLocalAngles(newAngles);
            jointManager.setAngles(WRITER_ID.FK, newAngles);
          }}
        />
      </div>
    </div>
  );
}
