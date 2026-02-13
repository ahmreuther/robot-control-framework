const radToDeg = (rad: number) => (rad * 180) / Math.PI;
const degToRad = (deg: number) => (deg * Math.PI) / 180;

import { useEffect, useState } from 'react';

import type { JointStateManager } from '../../../hooks/useJointState';
import type { JointProperty } from '../../../hooks/useSceneState';
import { CheckBox } from '../CheckBox';
import { SliderInput } from './SliderInput';

export interface JointAnglesPanelProps {
  jointManager: JointStateManager;
  step?: number;
  onCollisionMeshToggle?: (visible: boolean) => void;
  jointProperties?: (JointProperty | null)[];
  showCollisionMesh: boolean;
  setShowCollisionMesh?: (show: boolean) => void;
  reloadKey: number;
  hoveredJointMesh?: number | null;
}

export function JointAnglesPanel({
  jointManager,
  onCollisionMeshToggle,
  jointProperties,
  showCollisionMesh = false,
  setShowCollisionMesh,
  reloadKey,
  hoveredJointMesh,
}: JointAnglesPanelProps) {
  const [showRadians, setShowRadians] = useState(false);
  const [localAngles, setLocalAngles] = useState<number[]>([]);

  useEffect(() => {
    if (setShowCollisionMesh) setShowCollisionMesh(false);
  }, [reloadKey, setShowCollisionMesh]);

  useEffect(() => {
    const unsubscribe = jointManager.subscribe((angles) => setLocalAngles(angles));
    setLocalAngles(jointManager.getAngles());
    return unsubscribe;
  }, [jointManager]);

  return (
    <section className="panel flex h-full flex-col pointer-events-auto">
      <header className="panel-header">
        <div className="panel-title text-xs">Joint Angles</div>
      </header>

      <div className="panel-body flex flex-col overflow-y-auto">
        <div className="space-y-2">
          <CheckBox
            label="Collision Mesh"
            value={showCollisionMesh}
            onToggle={(checked) => {
              setShowCollisionMesh?.(checked);
              onCollisionMeshToggle?.(checked);
            }}
          />
          <CheckBox
            label="Show Radians"
            value={showRadians}
            onToggle={(checked) => setShowRadians(checked)}
          />
        </div>
        <div className="space-y-2">
          {localAngles.map((angle, i) => {
            const property = jointProperties?.[i];
            if (property == null) return null;
            if (property.min === property.max) return null;

            const minDisp = property.min;
            const maxDisp = property.max;
            const valueDisp = angle;

            const highlight = hoveredJointMesh === i;

            return (
              <div key={i} className={`row ${highlight ? 'row-hover' : ''}`}>
                <SliderInput
                  minDisp={minDisp}
                  maxDisp={maxDisp}
                  valueDisp={valueDisp}
                  property={property}
                  showRadians={showRadians}
                  localAngles={localAngles}
                  setLocalAngles={setLocalAngles}
                  i={i}
                  jointManager={jointManager}
                  radToDeg={radToDeg}
                  degToRad={degToRad}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
