import { useState } from 'react';

import type { ApplicationController } from '../../../app/model/applicationController';

export interface SynchronizeButtonProps {
  controller: ApplicationController;
  robotId: string;
}

export default function SynchronizeButton({
  controller,
  robotId,
}: SynchronizeButtonProps) {
  const [isSyncActive, setIsSyncActive] = useState(false);

  function toggleSync() {
    if (isSyncActive) {
      controller.stopRobotSync(robotId);
      setIsSyncActive(false);
      return;
    }

    const result = controller.startRobotSync(robotId);
    if (result?.runtime.started) {
      setIsSyncActive(true);
    }
  }

  return (
    <button
      className={`button-ghost ${isSyncActive ? 'active' : ''}`}
      onClick={toggleSync}
    >
      Sync
    </button>
  );
}
