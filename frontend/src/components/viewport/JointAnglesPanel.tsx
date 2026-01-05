import React from 'react';

const radToDeg = (rad: number) => (rad * 180) / Math.PI;
const degToRad = (deg: number) => (deg * Math.PI) / 180;

export interface JointAnglesPanelProps {
  jointAngles: number[];
  manualMode: boolean;
  onModeToggle: (enabled: boolean) => void;
  onAngleChange: (index: number, value: number) => void;
  onReset?: () => void;
  solveStatusText: string;
  minAngle?: number;
  maxAngle?: number;
  step?: number;
}

export function JointAnglesPanel({
  jointAngles,
  manualMode,
  onModeToggle,
  onAngleChange,
  onReset,
  solveStatusText,
  minAngle = -180,
  maxAngle = 180,
  step = 1,
}: JointAnglesPanelProps) {
  return (
    <div className="text-white text-xs space-y-1 max-h-[70vh] overflow-y-auto bg-black bg-opacity-50 p-4 rounded pointer-events-auto">
      <div>
        <label className="flex items-center gap-2 mb-2">
          <input 
            type="checkbox" 
            checked={manualMode}
            onChange={(e) => onModeToggle(e.target.checked)}
            className="cursor-pointer"
          />
          <span>Forward Kinematics</span>
        </label>
      </div>
      
      <div className="font-bold mt-2">Joint Angles (°):</div>
      <div className="space-y-2">
        {jointAngles.map((angle, i) => (
          <div key={i} className="flex items-center gap-2">
            <label className="w-12">J{i}:</label>
            <input
              type="range"
              min={minAngle}
              max={maxAngle}
              step={step}
              value={radToDeg(angle)}
              onChange={(e) => onAngleChange(i, degToRad(parseFloat(e.target.value)))}
              className="w-24"
              disabled={!manualMode}
            />
            <span className="w-16 text-right">{radToDeg(angle).toFixed(1)}°</span>
          </div>
        ))}
      </div>
      
      <button
        onClick={onReset}
        className="mt-3 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-xs font-semibold"
      >
        Reset to 0
      </button>
      
      <div className="font-bold mt-2">IK Status:</div>
      <div>{solveStatusText}</div>
    </div>
  );
}