const radToDeg = (rad: number) => (rad * 180) / Math.PI;
const degToRad = (deg: number) => (deg * Math.PI) / 180;

import { useState, useEffect } from 'react';
import type { JointProperty } from '../../../hooks/useSceneState';
import { JointStateManager, WRITER_ID, WRITER_PRIORITY } from '../../../hooks/useJointState';
import { useMethodCall } from 'src/components/Adressspace/hooks/useMethodCall';
import { UaNode } from 'src/components/Adressspace';
import { useSocket } from '../../../hooks/use-socket';

export interface JointAnglesPanelProps {
  jointManager: JointStateManager;
  step?: number;
  onCollisionMeshToggle?: (visible: boolean) => void;
  jointProperties: JointProperty[];
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
  hoveredJointMesh
}: JointAnglesPanelProps) {
  const [showRadians, setShowRadians] = useState(false);
  const [localAngles, setLocalAngles] = useState<number[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const socket = useSocket();

  const { 
      isOpen: methodDialogOpen, 
      methodNode, 
      inputs, 
      inputValues,
      result: methodResult,
      isLoading: methodLoading,
      openMethodDialog, 
      closeMethodDialog, 
      setInputValue, 
      callMethod 
    } = useMethodCall("opc.tcp://10.10.38.26:4840/freeopcua/server/", (socket as any));

  useEffect(() => {
    if (setShowCollisionMesh) setShowCollisionMesh(false);
  }, [reloadKey, setShowCollisionMesh]);

  useEffect(() => {
    const unsubscribe = jointManager.subscribe((angles) => setLocalAngles(angles));
    setLocalAngles(jointManager.getAngles());
    return unsubscribe;
  }, [jointManager]);

  useEffect(() => {
    if (!isEditing) return;
    jointManager.mountWriter(WRITER_ID.FK, WRITER_PRIORITY.FK);

    const handleEnd = () => { 
      jointManager.unmountWriter(WRITER_ID.FK);
      setIsEditing(false);
      const tmpNode: UaNode = {
        nodeId: "ns=4;s=Go To",
        displayName: "Go To Node",
        nodeClass: "Method"
    };
      openMethodDialog(tmpNode);
      setInputValue('automatic', `[${[...localAngles].join(', ')}]`);
      callMethod();
      closeMethodDialog();
    };
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchend', handleEnd);
      jointManager.unmountWriter(WRITER_ID.FK);
    };
  }, [isEditing, jointManager]);

  const toDisplay = (rad: number) => (showRadians ? rad : radToDeg(rad));
  const fromDisplay = (val: number) => (showRadians ? val : degToRad(val));

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
          Radians
        </label>
      </div>

      <div className="space-y-3">
        {localAngles.map((angle, i) => {
          const property = jointProperties?.[i] ?? undefined;
          if (property === null) return null;
          if (property && property.min === property.max) return null;

          let minDisp, maxDisp, valueDisp, stepDisp;
          if (property?.jointType === 'prismatic') {
            // Always use mm for prismatic
            minDisp = (property.min ?? 0) * 1000;
            maxDisp = (property.max ?? 1) * 1000;
            valueDisp = angle * 1000;
            const range = maxDisp - minDisp;
            stepDisp = Math.max(range / 100, 0.01); // mm
          } else {
            const minRad = property ? property.min : -Math.PI;
            const maxRad = property ? property.max : Math.PI;
            minDisp = toDisplay(minRad);
            maxDisp = toDisplay(maxRad);
            valueDisp = toDisplay(angle);
            const range = showRadians ? maxRad - minRad : radToDeg(maxRad) - radToDeg(minRad);
            stepDisp = showRadians
              ? Math.max(range / 100, 0.001)
              : Math.max(range / 100, 0.1);
          }

          const highlight = hoveredJointMesh === i;
          return (
            <div
              key={i}
              className={`flex items-center gap-2 px-2 py-1 rounded bg-white/5${highlight ? ' border border-blue-400 shadow-[0_0_6px_0_rgba(56,189,248,0.4)]' : ''}`}
              style={highlight ? { boxShadow: '0 0 6px 0 rgba(56,189,248,0.4)', borderWidth: 1, borderColor: '#38bdf8', background: 'rgba(56,189,248,0.07)' } : {}}
            >
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
                onChange={(e) => {
                  let v = Number(e.target.value);
                  if (property?.jointType === 'prismatic') {
                    v = v / 1000; // convert mm back to meters
                  } else {
                    v = fromDisplay(v);
                  }
                  const newAngles = [...localAngles];
                  newAngles[i] = v;
                  setLocalAngles(newAngles);
                  jointManager.setAngles(WRITER_ID.FK, newAngles);
                }}
              />
              <span className="w-16 text-right text-white/60">
                {property?.jointType === 'prismatic'
                  ? Math.round(valueDisp)
                  : (showRadians ? valueDisp.toFixed(2) : Math.round(valueDisp))}
              </span>
              {property?.jointType === 'prismatic' ? 'mm' : (showRadians ? 'rad' : '°')}
            </div>
          );
        })}
      </div>
    </div>
  );
}