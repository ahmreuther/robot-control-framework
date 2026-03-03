import { useContext, useEffect, useRef } from 'react';

import { useLogContext } from '../../../features/address-space/contexts/LogContext';
import { useRobotInfoContext } from '../../../features/robot-control/contexts/RobotInfoContext';
import { useServersContext } from '../../../features/server-management/contexts/ServersContext';
import { useSyncContext } from '../../../features/robot-control/contexts/SyncContext';
import { SocketContext } from '../../../features/socket/hooks/useSocket';
import type { JointStateManager } from '../../robot-control/hooks/useJointState';
import { handleIncomingMessage } from '../model/handlers';

export interface WebSocketReceiverProps {
  jointManager: JointStateManager;
}

export default function WebSocketReceiver({ jointManager }: WebSocketReceiverProps) {
  const socket = useContext(SocketContext);
  const lastProcessedMessageRef = useRef<MessageEvent | null>(null);
  const lastAxleUiUpdateAtRef = useRef(0);
  const { getServerRobotState, updateServerRobotState, resetServerRobotState } =
    useRobotInfoContext();
  const { appendLog } = useLogContext();
  const { isSyncActive } = useSyncContext();
  const {
    activeRuntimeServerId,
    activeASpaceServerId,
    setActiveRuntimeServerId,
    updateServerConnectionStatus,
  } = useServersContext();

  const targetServerId = activeRuntimeServerId ?? activeASpaceServerId;
  const targetServerState = getServerRobotState(targetServerId);

  useEffect(() => {
    const lastMessage = socket?.lastMessage;
    if (!lastMessage) return;
    if (lastProcessedMessageRef.current === lastMessage) return;

    lastProcessedMessageRef.current = lastMessage;

    const { data } = lastMessage;
    if (typeof data !== 'string') return;
    if (!data) return;

    const updateTargetState = (patch: Parameters<typeof updateServerRobotState>[1]) => {
      if (targetServerId === null) {
        return;
      }
      updateServerRobotState(targetServerId, patch);
    };

    const resetTargetState = () => {
      if (targetServerId === null) {
        return;
      }
      resetServerRobotState(targetServerId);
    };

    try {
      const { nextLastAxleUiUpdateAt } = handleIncomingMessage(data, {
        targetServerId,
        isSyncActive,
        orderedJointNames: targetServerState.orderedJointNames,
        opcuaJointLength: targetServerState.opcuaJointLength,
        lastAxleUiUpdateAt: lastAxleUiUpdateAtRef.current,
        jointManager,
        appendLog,
        updateTargetState,
        resetTargetState,
        updateServerConnectionStatus,
        setActiveRuntimeServerId,
      });

      lastAxleUiUpdateAtRef.current = nextLastAxleUiUpdateAt;
    } catch (err) {
      appendLog(`Error: Failed to handle incoming message (${String(err)}).\n`, targetServerId);
    }
  }, [
    appendLog,
    isSyncActive,
    jointManager,
    resetServerRobotState,
    setActiveRuntimeServerId,
    socket?.lastMessage,
    targetServerId,
    targetServerState.opcuaJointLength,
    targetServerState.orderedJointNames,
    updateServerConnectionStatus,
    updateServerRobotState,
  ]);

  return null;
}
