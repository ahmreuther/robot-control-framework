export function CheckBox({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: (boolean) => void;
}) {
  return (
    <div className="hover-surface flex space-x-2">
      <input
        type="checkbox"
        id={label.toLowerCase().replace(/\s+/g, "-")}
        checked={value}
        onChange={(e) => onToggle(e.target.checked)}
        className="check-input cursor-pointer"
      />
      <label htmlFor={label.toLowerCase().replace(/\s+/g, "-")} className="check-label">
        {label}
      </label>
    </div>
  );
}