import type { ReactNode } from "react";

interface DisclosureSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
  trailingContent?: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function DisclosureSection({
  title,
  open,
  onToggle,
  children,
  trailingContent,
  className = "",
  contentClassName = "",
}: DisclosureSectionProps) {
  return (
    <div className={`flex flex-col gap-1 text-xs ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <button
          className="flex items-center gap-1 text-left"
          type="button"
          onClick={onToggle}
        >
          <span
            className={`text-[10px] transition-transform ${
              open ? "rotate-90" : ""
            }`}
          >
            ▶
          </span>
          <span>{title}</span>
        </button>
        {trailingContent ? (
          <div className="flex items-center gap-2">{trailingContent}</div>
        ) : null}
      </div>
      {open ? (
        <div
          className={`panel panel-body ml-0 mt-1 flex flex-col gap-2 ${contentClassName}`}
          style={{ borderColor: "rgb(var(--panel-border) / 0.12)" }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
