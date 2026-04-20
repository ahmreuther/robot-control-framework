const radToDeg = (rad: number) => (rad * 180) / Math.PI;
const degToRad = (deg: number) => (deg * Math.PI) / 180;

import { useEffect, useState } from 'react';

import type { JointStateManager } from '../hooks/useJointState';
import type { JointProperty } from '../hooks/useSceneState';
import type { WorkspaceProgress, WorkspaceResolution } from '../model/workspaceGeneration';
import { CheckBox } from '../../../shared/CheckBox';
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
  setPendingJoints?: (joints: number[]) => void;
  workspaceResolution: WorkspaceResolution;
  setWorkspaceResolution: (resolution: WorkspaceResolution) => void;
  showWorkspace: boolean;
  setShowWorkspace: (visible: boolean) => void;
  hasWorkspace: boolean;
  isGeneratingWorkspace: boolean;
  workspaceProgress: WorkspaceProgress | null;
  onGenerateWorkspace: () => void;
  onCancelWorkspace: () => void;
}

export function JointAnglesPanel({
  jointManager,
  onCollisionMeshToggle,
  jointProperties,
  showCollisionMesh = false,
  setShowCollisionMesh,
  reloadKey,
  hoveredJointMesh,
  setPendingJoints,
  workspaceResolution,
  setWorkspaceResolution,
  showWorkspace,
  setShowWorkspace,
  hasWorkspace,
  isGeneratingWorkspace,
  workspaceProgress,
  onGenerateWorkspace,
  onCancelWorkspace,
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
          <CheckBox
            label="Show Work Envelope"
            value={showWorkspace}
            onToggle={(checked) => setShowWorkspace(checked)}
          />
          <div
            className="space-y-2 border-t pt-2"
            style={{ borderColor: 'rgb(var(--panel-border) / 0.12)' }}
          >
            <div className="flex items-center gap-2">
              <select
                value={workspaceResolution}
                onChange={(event) =>
                  setWorkspaceResolution(event.target.value as WorkspaceResolution)
                }
                disabled={isGeneratingWorkspace}
                className="input-ghost flex-1"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <button
                type="button"
                onClick={isGeneratingWorkspace ? onCancelWorkspace : onGenerateWorkspace}
                className="button-ghost"
              >
                {isGeneratingWorkspace ? 'Cancel' : hasWorkspace ? 'Regenerate' : 'Generate'}
              </button>
            </div>
            {workspaceProgress && (
              <div>
                <div className="mb-1 text-xs text-white/70">
                  {workspaceProgress.label} ({workspaceProgress.percent}%)
                </div>
                <div className="h-2 overflow-hidden bg-white/15">
                  <div
                    className="h-full bg-[rgb(var(--ok))]"
                    style={{ width: `${workspaceProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="relative space-y-2">
          {localAngles.map((angle, i) => {
            const property = jointProperties?.[i];
            if (property && property.min === property.max) return null;

            const minDisp = property?.min ?? -Math.PI;
            const maxDisp = property?.max ?? Math.PI;
            const valueDisp = angle;

            const highlight = hoveredJointMesh === i;

            return (
              <div key={i} className={`row ${highlight ? 'row-hover' : ''}`}>
                <SliderInput
                  minDisp={minDisp}
                  maxDisp={maxDisp}
                  valueDisp={valueDisp}
                  {...(property ? { property } : {})}
                  showRadians={showRadians}
                  localAngles={localAngles}
                  setLocalAngles={setLocalAngles}
                  i={i}
                  jointManager={jointManager}
                  radToDeg={radToDeg}
                  degToRad={degToRad}
                  setPendingJoints={setPendingJoints ?? (() => undefined)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
