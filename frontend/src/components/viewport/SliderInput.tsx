import { useEffect, useState } from 'react';

import type { JointStateManager } from '../../hooks/useJointState';
import { WRITER_ID, WRITER_PRIORITY } from '../../hooks/useJointState';
import type { JointProperty } from '../../hooks/useSceneState';
import { useMethodCall } from '../Adressspace/hooks/useMethodCall';
import { UaNode } from '../Adressspace/types';
import { useSocket } from '../../hooks/use-socket';

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
}: SliderProps) {
  let minDispLocal = minDisp;
  let maxDispLocal = maxDisp;
  let valueDispLocal = valueDisp;
  let stepDisp: number;
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

  const socket = useSocket();
  const {
    isOpen: methodDialogOpen,
    result: methodResult,
    isLoading: methodLoading,
    directCallMethod,
  } = useMethodCall('opc.tcp://127.0.0.1:4840/freeopcua/server/', socket as any);

  const [isEditing, setIsEditing] = useState(false);

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
    if (!isEditing) return;
    jointManager.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);

    const handleEnd = () => {
      jointManager.unmountWriter(WRITER_ID.FK);
      setIsEditing(false);
      const tmpNode: UaNode = {
        nodeId: 'ns=4;s=Go To',
        displayName: 'Go To Node',
        nodeClass: 'Method',
      };
      directCallMethod(tmpNode, {
        mode: 'automatic',
        joints: JSON.stringify(jointManager.getAngles()),
      });
    };
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchend', handleEnd);
      jointManager.unmountWriter(WRITER_ID.FK);
    };
  }, [localAngles]);

  const handleBeginEdit = () => setIsEditing(true);

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
          onMouseDown={handleBeginEdit}
          onTouchStart={handleBeginEdit}
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
