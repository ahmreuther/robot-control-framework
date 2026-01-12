const radToDeg = (rad: number) => (rad * 180) / Math.PI;
const degToRad = (deg: number) => (deg * Math.PI) / 180;

import { useState } from 'react';
import type { JointLimit } from '../../../hooks/useSceneState';

export interface JointAnglesPanelProps {
  jointAngles: number[];
  setJointAngles: (angles: number[]) => void;
  setFkMode: (enabled: boolean) => void;
  minAngle?: number;
  maxAngle?: number;
  step?: number;
  onCollisionMeshToggle?: (visible: boolean) => void;
  jointLimits?: Array<JointLimit | null>;
}

export function JointAnglesPanel({
  jointAngles,
  setJointAngles,
  setFkMode,
  minAngle = -180,
  maxAngle = 180,
  step = 1,
  onCollisionMeshToggle,
  jointLimits,
}: JointAnglesPanelProps) {
  const [showCollisionMesh, setShowCollisionMesh] = useState(false);

  const handleAngleChange = (index: number, value: number) => {
    const updated = [...jointAngles];
    updated[index] = value;
    setJointAngles(updated);
  };

  const handleSliderClick = () => {
    setFkMode(true);
  };

  const handleSliderRelease = () => {
    setFkMode(false);
  };

  const handleCollisionMeshChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const visible = e.target.checked;
    setShowCollisionMesh(visible);
    onCollisionMeshToggle?.(visible);
  };
  
  return (
    <div className="text-white text-xs space-y-2 max-h-[70vh] overflow-y-auto bg-black p-4 rounded border border-white/20 pointer-events-auto">
      <div className="font-bold mb-3 text-sm uppercase tracking-wide text-white/90">Joint Angles</div>
      
      {/* Collision Mesh Checkbox */}
      <div className="flex items-center gap-2 px-2 py-2 rounded bg-white/5 mb-3">
        <input
          type="checkbox"
          id="collision-mesh"
          checked={showCollisionMesh}
          onChange={handleCollisionMeshChange}
          className="w-4 h-4 cursor-pointer"
        />
        <label htmlFor="collision-mesh" className="cursor-pointer text-white/80 flex-1">
          Show Collision Mesh
        </label>
      </div>

      <div className="space-y-3">
        {jointAngles.map((angle, i) => {
          // Hide fixed/unactuated joints: null entry or zero-range limit
          const limit = jointLimits?.[i] ?? undefined;
          if (limit === null) return null;
          if (limit && limit.min === limit.max) return null;

          return (
          <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-white/5">
            <label className="w-12 text-white/80">J{i}:</label>
            {(() => {
              const minDeg = limit ? radToDeg(limit.min) : minAngle;
              const maxDeg = limit ? radToDeg(limit.max) : maxAngle;
              return (
                <input
                  type="range"
                  min={minDeg}
                  max={maxDeg}
                  step={step}
                  value={radToDeg(angle)}
                  onMouseDown={handleSliderClick}
                  onMouseUp={handleSliderRelease}
                  onTouchStart={handleSliderClick}
                  onTouchEnd={handleSliderRelease}
                  onChange={(e) => handleAngleChange(i, degToRad(parseFloat(e.target.value)))}
                  className="flex-1"
                />
              );
            })()}
            <span className="w-16 text-right">{radToDeg(angle).toFixed(1)}°</span>
          </div>
          );
        })}
      </div>
    </div>
  );
}