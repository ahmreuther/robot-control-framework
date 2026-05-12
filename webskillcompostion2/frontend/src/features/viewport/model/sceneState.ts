import { useMemo, useState } from "react";
import type { Vector3 } from "three";

export interface ViewportSceneSettings {
  effectComposer: boolean;
  environment: boolean;
  grid: boolean;
  stats: boolean;
}

export interface ViewportSceneState {
  settings: ViewportSceneSettings;
  workspacePoints: Vector3[];
  toggleSetting(key: keyof ViewportSceneSettings): void;
}

const DEFAULT_SETTINGS: ViewportSceneSettings = {
  effectComposer: true,
  environment: true,
  grid: true,
  stats: false,
};

export function useViewportSceneState(): ViewportSceneState {
  const [settings, setSettings] = useState<ViewportSceneSettings>(DEFAULT_SETTINGS);
  const [workspacePoints] = useState<Vector3[]>([]);

  return useMemo(
    () => ({
      settings,
      workspacePoints,
      toggleSetting(key: keyof ViewportSceneSettings) {
        setSettings((current) => ({
          ...current,
          [key]: !current[key],
        }));
      },
    }),
    [settings, workspacePoints],
  );
}
