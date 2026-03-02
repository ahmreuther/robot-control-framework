import { useContext, useState } from 'react';

import { useLogContext } from '../../contexts/LogContext';
import { RobotInfoContext } from '../../contexts/RobotInfoContext';
import { useUrlContext } from '../../contexts/UrlContext';
import { useSendMessage } from '../../hooks/send-message';
import { type JointStateManager, WRITER_ID, WRITER_PRIORITY } from '../../hooks/useJointState';
import { useSyncContext } from '../../contexts/SyncContext';

export interface SynchronizeButtonProps {
  jointManager: JointStateManager;
}

export default function Synchronize_Button({ jointManager }: SynchronizeButtonProps) {
  const { url: connectedUrl } = useUrlContext();
  const { setLogs } = useLogContext();
  const { isSyncActive, setIsSyncActive } = useSyncContext();
  const { sendMessage } = useSendMessage();

  const axleValues = useContext(RobotInfoContext).axleValues;

  const [switchState, setToggle] = useState(false);

  function synchronize(toggleState: boolean): boolean {
    if (!connectedUrl) {
      console.log('No OPC UA client connected. Please connect first.');
      setLogs((prev) => prev + 'No OPC UA client connected. Please connect first.\n');
      return false;
    }

    if (toggleState) {
      sendMessage('stream joint position');
      sendMessage('stream mode');
      setLogs((prev) => prev + 'Synchronization activated.\n');

      jointManager.mountWriter(WRITER_ID.SYN, WRITER_PRIORITY.SYN);
    } else {
      sendMessage('cancel stream joint position');
      sendMessage('cancel stream mode');
      setLogs((prev) => prev + 'Synchronization deactivated.\n');
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
