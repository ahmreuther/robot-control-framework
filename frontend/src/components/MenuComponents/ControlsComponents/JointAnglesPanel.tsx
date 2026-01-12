const radToDeg = (rad: number) => (rad * 180) / Math.PI;
const degToRad = (deg: number) => (deg * Math.PI) / 180;

export interface JointAnglesPanelProps {
  jointAngles: number[];
  setJointAngles: (angles: number[]) => void;
  setFkMode: (enabled: boolean) => void;
  minAngle?: number;
  maxAngle?: number;
  step?: number;
}

export function JointAnglesPanel({
  jointAngles,
  setJointAngles,
  setFkMode,
  minAngle = -180, //Todo: adjust based on robot limits
  maxAngle = 180, //Todo: adjust based on robot limits
  step = 1,
}: JointAnglesPanelProps) {

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
  
  return (
    <div className="text-white text-xs space-y-1 max-h-[70vh] overflow-y-auto bg-black bg-opacity-50 p-4 rounded pointer-events-auto">
      <div className="font-bold mt-2">Joint Angles:</div>
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
              onMouseUp={handleSliderRelease}
              onTouchStart={handleSliderClick}
              onTouchEnd={handleSliderRelease}
              onChange={(e) => handleAngleChange(i, degToRad(parseFloat(e.target.value)))}
              className="w-24"
            />
            <span className="w-16 text-right">{radToDeg(angle).toFixed(1)}°</span>
          </div>
        ))}
      </div>
    </div>
  );
}