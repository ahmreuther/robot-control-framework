const radToDeg = (rad: number) => (rad * 180) / Math.PI;
const degToRad = (deg: number) => (deg * Math.PI) / 180;

export interface JointAnglesPanelProps {
  jointAngles: number[];
  fkMode: boolean;
  setFkMode: (enabled: boolean) => void;
  onAngleChange: (index: number, value: number) => void;
  minAngle?: number;
  maxAngle?: number;
  step?: number;
}

export function JointAnglesPanel({
  jointAngles,
  fkMode,
  setFkMode,
  onAngleChange,
  minAngle = -180, //Todo: adjust based on robot limits
  maxAngle = 180, //Todo: adjust based on robot limits
  step = 1,
}: JointAnglesPanelProps) {
  const handleSliderClick = () => {
    if (!fkMode) {
      setFkMode(true);
    }
  };
  return (
    <div className="text-white text-xs space-y-1 max-h-[70vh] overflow-y-auto bg-black bg-opacity-50 p-4 rounded pointer-events-auto">
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
              onMouseDown={handleSliderClick}
              onTouchStart={handleSliderClick}
              onChange={(e) => onAngleChange(i, degToRad(parseFloat(e.target.value)))}
              className="w-24"
            />
            <span className="w-16 text-right">{radToDeg(angle).toFixed(1)}°</span>
          </div>
        ))}
      </div>
    </div>
  );
}