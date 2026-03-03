import { useState } from 'react';

import useIsMobile from './useIsMobile';

export interface SettingsState {
  environment: boolean;
  effectComposer: boolean;
}

export type MobilePanelState = 'none' | 'main' | 'side' | 'bot';

export function useAppShellState() {
  const [settings, setSettings] = useState<SettingsState>({
    environment: true,
    effectComposer: true,
  });

  const [mobilePanelState, setMobilePanelState] = useState<MobilePanelState>('none');
  const [pendingJoints, setPendingJoints] = useState<number[]>([]);

  const isMobile = useIsMobile();

  const toggleSettings = (key: keyof SettingsState) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return {
    settings,
    toggleSettings,
    mobilePanelState,
    setMobilePanelState,
    pendingJoints,
    setPendingJoints,
    isMobile,
  } as const;
}
