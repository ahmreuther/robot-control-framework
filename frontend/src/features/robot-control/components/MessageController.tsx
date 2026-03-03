import { useEffect, useRef, useState } from 'react';
import {
  type UaNode,
  useDirectMethodCallStatus,
  useMethodCall,
} from '../../address-space';
import { useSocket } from '../../../features/socket/hooks/useSocket';
import { useSyncContext } from '../../../app/providers/contexts';
import { useUrlContext } from '../../../app/providers/contexts';
import { JointStateManager, WRITER_ID, WRITER_PRIORITY } from '../hooks/useJointState';
import { useRobotInfoContext } from '../../../app/providers/contexts';

interface MessageControllerProps {
  pendingJoints: number[];
  setPendingJoints: (joints: number[] | null) => void;
  jointManager: JointStateManager;
}

let lastGlobalGotoRequestKey: string | null = null;
let lastGlobalGotoRequestAt = 0;

function MessageController({ pendingJoints, setPendingJoints, jointManager }: MessageControllerProps) {
  const { url: opcUaUrl } = useUrlContext();
  const { isSyncActive } = useSyncContext();
  const { gotoMethodNodeId, opcuaJointLength } = useRobotInfoContext();
  const socket = useSocket();
  const methodCallStatus = useDirectMethodCallStatus();
  const [waitingForMethodResult, setWaitingForMethodResult] = useState(false);
  const lastRequestedJointsKeyRef = useRef<string | null>(null);
  const prevSyncActiveRef = useRef(false);
  const waitingSinceRef = useRef<number | null>(null);

  const { directCallMethod } = useMethodCall(opcUaUrl, socket as any);

  useEffect(() => {
    if (!isSyncActive) return;
    if (waitingForMethodResult) {
      const now = Date.now();
      if (waitingSinceRef.current && now - waitingSinceRef.current > 2000) {
        setWaitingForMethodResult(false);
        waitingSinceRef.current = null;
      } else {
        return;
      }
    }
    if (!gotoMethodNodeId || !opcUaUrl) return;
    const jointCount = opcuaJointLength ?? pendingJoints.length;
    if (jointCount <= 0) return;
    const mappedJoints = pendingJoints.slice(0, jointCount);
    if (!mappedJoints.length) return;
    const jointsKey = JSON.stringify(mappedJoints);
    if (jointsKey === lastRequestedJointsKeyRef.current) return;

    const requestKey = `${opcUaUrl}|${gotoMethodNodeId}|${jointsKey}`;
    const now = Date.now();
    if (requestKey === lastGlobalGotoRequestKey && now - lastGlobalGotoRequestAt < 1000) {
      return;
    }

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
    lastGlobalGotoRequestKey = requestKey;
    lastGlobalGotoRequestAt = now;
    setPendingJoints(null);
    setWaitingForMethodResult(true);
    waitingSinceRef.current = now;
  }, [
    pendingJoints,
    isSyncActive,
    directCallMethod,
    waitingForMethodResult,
    jointManager,
    opcuaJointLength,
    gotoMethodNodeId,
    opcUaUrl,
    setPendingJoints,
  ]);

  useEffect(() => {
    // force new request cycle when OPC UA joint length changes
    lastRequestedJointsKeyRef.current = null;
    setWaitingForMethodResult(false);
  }, [opcuaJointLength]);

  useEffect(() => {
    if (isSyncActive && !prevSyncActiveRef.current) {
      prevSyncActiveRef.current = true;
      setPendingJoints(null);
      lastRequestedJointsKeyRef.current = null;
      waitingSinceRef.current = null;
      return;
    }

    prevSyncActiveRef.current = isSyncActive;
    lastRequestedJointsKeyRef.current = null;
    lastGlobalGotoRequestKey = null;
    setWaitingForMethodResult(false);
    waitingSinceRef.current = null;
  }, [isSyncActive, setPendingJoints]);

  useEffect(() => {
    if (!waitingForMethodResult) return;
    if (methodCallStatus.status !== 'Ready') return;
    if (methodCallStatus.lastNodeId !== gotoMethodNodeId) return;
    setWaitingForMethodResult(false);
    waitingSinceRef.current = null;
  }, [waitingForMethodResult, methodCallStatus.status, methodCallStatus.lastNodeId]);

  return <></>;
}

export default MessageController;
