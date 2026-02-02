import { useState } from "react";
import type { SettingsState } from "../App";

interface SettingsProps {
  settings: SettingsState;
  toggleSettings: (key: keyof SettingsState) => void;
}

export default function Settings(props : SettingsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-neutral-800 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-700"
      >
        Settings
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <div className="fixed left-4 top-4 z-50 w-80 -xl bg-neutral-900 p-4 text-neutral-100 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Settings</h2>
            <button
              onClick={() => setOpen(false)}
              className="text-neutral-400 hover:text-neutral-200"
            >
              ✕
            </button>
          </div>

          <SettingToggle
            label="Effect Composer"
            value={props.settings.effectComposer}
            onToggle={() => props.toggleSettings("effectComposer")}
          />

          <SettingToggle
            label="Environment"
            value={props.settings.environment}
            onToggle={() => props.toggleSettings("environment")}
          />
        </div>
      )}
    </>
  );
}

function SettingToggle({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <button
        onClick={onToggle}
        className={`h-6 w-11 -full transition ${
          value ? "bg-emerald-500" : "bg-neutral-700"
        }`}
      >
        <span
          className={`block h-5 w-5 translate-y-0.5 -full bg-white transition ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
