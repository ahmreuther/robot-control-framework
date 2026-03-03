import { useState } from 'react';

import { useLogContext } from '../../../app/providers/contexts';
import { useServersContext } from '../../../app/providers/contexts';
import { useSendMessage } from '../../../features/socket/hooks/useSendMessage';
import { type JointStateManager, WRITER_ID, WRITER_PRIORITY } from '../../robot-control/hooks/useJointState';
import { useSyncContext } from '../../../app/providers/contexts';

export interface SynchronizeButtonProps {
  jointManager: JointStateManager;
  serverId: number | null;
}

export default function SynchronizeButton({ jointManager, serverId }: SynchronizeButtonProps) {
  const { appendLog } = useLogContext();
  const { isSyncActive, setIsSyncActive } = useSyncContext();
  const { sendMessage } = useSendMessage();
  const { findServerById } = useServersContext();
  const targetServer = findServerById(serverId);
  const connectedUrl = targetServer?.connectedUrl ?? null;
  const isConnected = targetServer?.isConnected ?? false;

  const [switchState, setToggle] = useState(false);

  function synchronize(toggleState: boolean): boolean {
    if (!connectedUrl || !isConnected) {
      console.log('No OPC UA client connected. Please connect first.');
      appendLog('No OPC UA client connected. Please connect first.\n', serverId);
      return false;
    }

    if (toggleState) {
      sendMessage('stream joint position', { serverId });
      sendMessage('stream mode', { serverId });
      appendLog('Synchronization activated.\n', serverId);

      jointManager.mountWriter(WRITER_ID.SYN, WRITER_PRIORITY.SYN);
    } else {
      sendMessage('cancel stream joint position', { serverId });
      sendMessage('cancel stream mode', { serverId });
      appendLog('Synchronization deactivated.\n', serverId);
      jointManager.unmountWriter(WRITER_ID.SYN);
    }
    return true;
  }

  return (
    <button
      className={`button-ghost ${isSyncActive ? 'active' : ''}`}
      onClick={() => {
        const newState = !switchState;
        const maySwitch = synchronize(newState);
        if (maySwitch) {
          setToggle(newState);
          setIsSyncActive(newState);
        }
      }}
    >
      Sync
    </button>
  );
}
