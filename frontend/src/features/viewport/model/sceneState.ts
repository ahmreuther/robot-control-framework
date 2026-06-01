import { useMemo, useState } from "react";
import type { WorkspaceResolution } from "./workspaceSurfaceGeneration";

export interface ViewportSceneSettings {
  effectComposer: boolean;
  environment: boolean;
  grid: boolean;
  stats: boolean;
  workspaceResolution: WorkspaceResolution;
}

export interface ViewportSceneState {
  settings: ViewportSceneSettings;
  toggleSetting(key: keyof ViewportSceneSettings): void;
  setWorkspaceResolution(resolution: WorkspaceResolution): void;
}

const DEFAULT_SETTINGS: ViewportSceneSettings = {
  effectComposer: true,
  environment: false,
  grid: true,
  stats: true,
  workspaceResolution: "low",
};

export function useViewportSceneState(): ViewportSceneState {
  const [settings, setSettings] =
    useState<ViewportSceneSettings>(DEFAULT_SETTINGS);

  return useMemo(
    () => ({
      settings,
      toggleSetting(key: keyof ViewportSceneSettings) {
        if (key === "workspaceResolution") {
          return;
        }
        setSettings((current) => ({
          ...current,
          [key]: !current[key],
        }));
      },
      setWorkspaceResolution(resolution: WorkspaceResolution) {
        setSettings((current) => ({
          ...current,
          workspaceResolution: resolution,
        }));
      },
    }),
    [settings],
  );
}
