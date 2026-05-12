import { useState } from "react";

import type { ViewportSceneState } from "../model/sceneState";

interface ViewportSettingsButtonProps {
  sceneState: ViewportSceneState;
}

export default function ViewportSettingsButton({
  sceneState,
}: ViewportSettingsButtonProps) {
  const [open, setOpen] = useState(false);

  const entries: Array<{ key: keyof typeof sceneState.settings; label: string }> = [
    { key: "effectComposer", label: "Effect Composer" },
    { key: "environment", label: "Environment" },
    { key: "grid", label: "Grid" },
    { key: "stats", label: "Stats" },
  ];

  return (
    <div className="relative">
      <button className="button-ghost" onClick={() => setOpen((current) => !current)}>
        Settings
      </button>
      {open && (
        <div className="panel absolute right-0 top-8 z-20 w-44">
          <div className="panel-body flex flex-col gap-2">
            {entries.map((entry) => (
              <label key={entry.key} className="flex items-center justify-between gap-3 text-xs">
                <span>{entry.label}</span>
                <input
                  type="checkbox"
                  checked={sceneState.settings[entry.key]}
                  onChange={() => sceneState.toggleSetting(entry.key)}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
