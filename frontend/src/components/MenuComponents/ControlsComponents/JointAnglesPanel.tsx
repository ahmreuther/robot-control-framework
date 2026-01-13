const radToDeg = (rad: number) => (rad * 180) / Math.PI;
const degToRad = (deg: number) => (deg * Math.PI) / 180;

import { useState, useEffect } from 'react';
import type { JointLimit } from '../../../hooks/useSceneState';
import type { JointStateManager } from '../../../hooks/useJointState';

export interface JointAnglesPanelProps {
  jointManager: JointStateManager;
  minAngle?: number;
  maxAngle?: number;
  step?: number;
  onCollisionMeshToggle?: (visible: boolean) => void;
  jointLimits?: Array<JointLimit | null>;
}

const PANEL_WRITER_ID = 'joint-angles-panel';
const PANEL_PRIORITY = 1; // Lowest; overridden by DRAG (2) and IK (3)

export function JointAnglesPanel({
  jointManager,
  minAngle,
  maxAngle,
  step = 1,
  onCollisionMeshToggle,
  jointLimits,
}: JointAnglesPanelProps) {
  const [showCollisionMesh, setShowCollisionMesh] = useState(false);
  const [showRadians, setShowRadians] = useState(false);
  const [localAngles, setLocalAngles] = useState<number[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  // Subscribe to joint angle changes (read)
  useEffect(() => {
    const unsubscribe = jointManager.subscribe((angles) => setLocalAngles(angles));
    setLocalAngles(jointManager.getAngles());
    return unsubscribe;
  }, [jointManager]);

  // While editing, mount writer; unmount on release
  useEffect(() => {
    if (!isEditing) return;
    // Try to take write control
    jointManager.mountWriter(PANEL_WRITER_ID, PANEL_PRIORITY);

    const handleEnd = () => {
      jointManager.unmountWriter(PANEL_WRITER_ID);
      setIsEditing(false);
    };
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchend', handleEnd);
      jointManager.unmountWriter(PANEL_WRITER_ID);
    };
  }, [isEditing, jointManager]);

  const toDisplay = (rad: number) => (showRadians ? rad : radToDeg(rad));
  const fromDisplay = (val: number) => (showRadians ? val : degToRad(val));

  const handleAngleChange = (index: number, displayValue: number) => {
    const rad = fromDisplay(displayValue);
    const newAngles = [...localAngles];
    newAngles[index] = rad;
    setLocalAngles(newAngles); // Local optimistic update
    // Write only while we have writer mounted (isEditing true)
    jointManager.setAngles(PANEL_WRITER_ID, newAngles);
  };

  const handleBeginEdit = () => setIsEditing(true);

  const handleCollisionMeshChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const visible = e.target.checked;
    setShowCollisionMesh(visible);
    onCollisionMeshToggle?.(visible);
  };

  return (
    <div className="text-white text-xs space-y-2 max-h-[70vh] overflow-y-auto bg-black p-4 rounded border border-white/20 pointer-events-auto">
      <div className="font-bold mb-3 text-sm uppercase tracking-wide text-white/90">Joint Angles</div>

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

      <div className="flex items-center gap-2 px-2 py-2 rounded bg-white/5 mb-3">
        <input
          type="checkbox"
          id="show-radians"
          checked={showRadians}
          onChange={(e) => setShowRadians(e.target.checked)}
          className="w-4 h-4 cursor-pointer"
        />
        <label htmlFor="show-radians" className="cursor-pointer text-white/80 flex-1">
          {showRadians ? 'Radians' : 'Degrees'}
        </label>
      </div>

      <div className="space-y-3">
        {localAngles.map((angle, i) => {
          const limit = jointLimits?.[i] ?? undefined;
          if (limit === null) return null;
          if (limit && limit.min === limit.max) return null;

          const minRad = limit ? limit.min : (minAngle !== undefined ? degToRad(minAngle) : -Math.PI);
          const maxRad = limit ? limit.max : (maxAngle !== undefined ? degToRad(maxAngle) : Math.PI);

          const minDisp = toDisplay(minRad);
          const maxDisp = toDisplay(maxRad);
          const valueDisp = toDisplay(angle);
          const stepDisp = showRadians ? degToRad(step) : step;

          return (
            <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-white/5">
              <label className="w-12 text-white/80">J{i}:</label>
              <input
                type="range"
                className="flex-1"
                min={minDisp}
                max={maxDisp}
                step={stepDisp}
                value={valueDisp}
                onMouseDown={handleBeginEdit}
                onTouchStart={handleBeginEdit}
                onChange={(e) => handleAngleChange(i, Number(e.target.value))}
              />
              <span className="w-16 text-right text-white/60">
                {showRadians ? valueDisp.toFixed(3) : Math.round(valueDisp)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}