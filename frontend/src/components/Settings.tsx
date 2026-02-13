import { useState } from 'react';

import type { SettingsState } from '../App';
import { CheckBox } from './CheckBox';

interface SettingsProps {
  settings: SettingsState;
  toggleSettings: (key: keyof SettingsState) => void;
}

export default function Settings(props: SettingsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setOpen(true)} className="button-ghost">
        Settings
      </button>

      {open && <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />}

      {open && (
        <div className="panel fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex-col overflow-hidden">
          <div className="panel-header">
            <div className="panel-title">Settings</div>
            <button onClick={() => setOpen(false)} className="button-ghost">
              ✕
            </button>
          </div>

          <div className="panel-body">
            <CheckBox
              label="Effect Composer"
              value={props.settings.effectComposer}
              onToggle={() => props.toggleSettings('effectComposer')}
            />

            <CheckBox
              label="Environment"
              value={props.settings.environment}
              onToggle={() => props.toggleSettings('environment')}
            />
          </div>
        </div>
      )}
    </div>
  );
}
