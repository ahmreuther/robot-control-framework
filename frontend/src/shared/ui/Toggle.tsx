import type { ButtonHTMLAttributes } from "react";

interface ToggleProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({
  checked,
  disabled,
  onChange,
  className = "",
  ...props
}: ToggleProps) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
      className={`relative inline-flex h-5 w-10 shrink-0 items-center border p-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand)/0.35)] ${
        checked
          ? "border-[rgb(var(--brand)/0.7)] bg-[rgb(var(--brand)/0.08)]"
          : "border-[rgb(var(--panel-border)/0.1)] bg-[rgb(var(--panel))]"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${className}`}
    >
      <span
        className={`pointer-events-none inline-block h-3 w-3 bg-[rgb(var(--fg))] shadow transition-transform duration-150 ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}
