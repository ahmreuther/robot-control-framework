import { useState, useEffect } from 'react';
import type { JointProperty } from '../../../hooks/useSceneState';
import { JointStateManager, WRITER_ID, WRITER_PRIORITY } from '../../../hooks/useJointState';

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
    handleBeginEdit: () => void;
    radToDeg: (rad: number) => number;
    degToRad: (deg: number) => number;
}

export function Slider({
    minDisp,
    maxDisp,
    valueDisp,
    i,
    property,
    jointManager,
    localAngles,
    setLocalAngles,
    showRadians,
    handleBeginEdit,
    radToDeg,
    degToRad
  }: SliderProps) {

    let minDispLocal = minDisp;
    let maxDispLocal = maxDisp;
    let valueDispLocal = valueDisp;
    let stepDisp: number;
    let angle = localAngles[i];
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
        stepDisp = showRadians
            ? Math.max(range / 100, 0.001)
            : Math.max(range / 100, 0.1);
    }

    return (
                <div className="w-full">
                        <div className='flex items-center'>
                                <label className="w-12 text-white/80">J{i}:</label>
                                <div className="flex flex-1 justify-end items-center gap-1">
                                        <span className="w-16 text-right text-white/60">
                                                {property?.jointType === 'prismatic'
                                                        ? valueDispLocal.toFixed(2)
                                                        : (showRadians ? valueDispLocal.toFixed(2) : Math.round(valueDispLocal))}
                                        </span>
                                        <span className="text-white/60">
                                                {property?.jointType === 'prismatic' ? 'mm' : (showRadians ? 'rad' : '°')}
                                        </span>
                                </div>
                        </div>
                        <div className='flex'>
                                <input
                                    type="range"
                                    className="flex-1"
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
    )
}
