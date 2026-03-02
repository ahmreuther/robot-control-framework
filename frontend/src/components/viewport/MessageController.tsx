import { useEffect, useRef, useState } from 'react';
import { useDirectMethodCallStatus, useMethodCall } from '../Adressspace/hooks/useMethodCall';
import { UaNode } from '../Adressspace/types';
import { useSocket } from '../../hooks/use-socket';
import { useSyncContext } from '../../contexts/SyncContext';
import { useUrlContext } from '../../contexts/UrlContext';
import { JointStateManager, WRITER_ID, WRITER_PRIORITY } from '../../hooks/useJointState';
import { useRobotInfoContext } from '../../contexts/RobotInfoContext';

interface MessageControllerProps {
  pendingJoints: number[];
  setPendingJoints: (joints: number[] | null) => void;
  jointManager: JointStateManager;
}

function MessageController({ pendingJoints, jointManager }: MessageControllerProps) {
  const { url: opcUaUrl } = useUrlContext();
  const { isSyncActive } = useSyncContext();
  const { gotoMethodNodeId, opcuaJointLength } = useRobotInfoContext();
  const socket = useSocket();
  const methodCallStatus = useDirectMethodCallStatus();
  const [waitingForMethodResult, setWaitingForMethodResult] = useState(false);
  const lastRequestedJointsKeyRef = useRef<string | null>(null);

  const { directCallMethod } = useMethodCall(opcUaUrl, socket as any);

  useEffect(() => {
    if (!isSyncActive) return;
    if (waitingForMethodResult) return;
    if (methodCallStatus.status !== 'Ready') return;
    if (opcuaJointLength === null) return;
    const mappedJoints = pendingJoints.slice(0, opcuaJointLength);
    const jointsKey = JSON.stringify(mappedJoints);
    if (jointsKey === lastRequestedJointsKeyRef.current) return;

    const tmpNode: UaNode = {
      nodeId: gotoMethodNodeId,
      displayName: 'Go To Node',
      nodeClass: 'Method',
    };

    directCallMethod(tmpNode, {
      mode: 'automatic',
      joints: jointsKey,
    });
    jointManager.mountWriter(WRITER_ID.SYN, WRITER_PRIORITY.SYN);
    lastRequestedJointsKeyRef.current = jointsKey;
    setWaitingForMethodResult(true);
  }, [
    pendingJoints,
    isSyncActive,
    directCallMethod,
    waitingForMethodResult,
    methodCallStatus.status,
    jointManager,
    opcuaJointLength,
    gotoMethodNodeId,
  ]);

  useEffect(() => {
    // force new request cycle when OPC UA joint length changes
    lastRequestedJointsKeyRef.current = null;
    setWaitingForMethodResult(false);
  }, [opcuaJointLength]);

  useEffect(() => {
    if (!waitingForMethodResult) return;
    if (methodCallStatus.status !== 'Ready') return;
    if (methodCallStatus.lastNodeId !== gotoMethodNodeId) return;
    setWaitingForMethodResult(false);
  }, [waitingForMethodResult, methodCallStatus.status, methodCallStatus.lastNodeId]);

  return <></>;
}

export default MessageController;
