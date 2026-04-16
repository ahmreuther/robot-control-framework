import { useContext, useEffect, useRef } from 'react';

import { useLogContext } from '../../../features/address-space/contexts/LogContext';
import { useRobotInfoContext } from '../../../features/robot-control/contexts/RobotInfoContext';
import { useServersContext } from '../../../features/server-management/contexts/ServersContext';
import { useSyncContext } from '../../../features/robot-control/contexts/SyncContext';
import { SocketContext } from '../../../features/socket/hooks/useSocket';
import type { JointStateManager } from '../../robot-control/hooks/useJointState';
import { normalizeIncomingMessage } from '../model/parser';
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
    servers,
    activeRuntimeServerId,
    activeASpaceServerId,
    setActiveRuntimeServerId,
    updateServerConnectionStatus,
  } = useServersContext();

  const targetServerId = activeRuntimeServerId ?? activeASpaceServerId;

  useEffect(() => {
    const lastMessage = socket?.lastMessage;
    if (!lastMessage) return;
    if (lastProcessedMessageRef.current === lastMessage) return;

    lastProcessedMessageRef.current = lastMessage;

    const { data } = lastMessage;
    if (typeof data !== 'string') return;
    if (!data) return;

    const normalized = normalizeIncomingMessage(data);
    const scopedServerId = normalized.scope
      ? (servers.find((server) => server.connectedUrl === normalized.scope)?.id ?? null)
      : null;
    const effectiveServerId = scopedServerId ?? targetServerId;
    const effectiveState = getServerRobotState(effectiveServerId);

    const updateTargetState = (patch: Parameters<typeof updateServerRobotState>[1]) => {
      if (effectiveServerId === null) {
        return;
      }
      updateServerRobotState(effectiveServerId, patch);
    };

    const resetTargetState = () => {
      if (effectiveServerId === null) {
        return;
      }
      resetServerRobotState(effectiveServerId);
    };

    try {
      const { nextLastAxleUiUpdateAt } = handleIncomingMessage(normalized.message, {
        targetServerId: effectiveServerId,
        isSyncActive,
        orderedJointNames: effectiveState.orderedJointNames,
        opcuaJointLength: effectiveState.opcuaJointLength,
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
    getServerRobotState,
    isSyncActive,
    jointManager,
    resetServerRobotState,
    setActiveRuntimeServerId,
    servers,
    socket?.lastMessage,
    targetServerId,
    updateServerConnectionStatus,
    updateServerRobotState,
  ]);

  return null;
}
