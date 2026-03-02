import { useEffect, useRef, useState } from 'react';
import { useMethodCall } from '../Adressspace/hooks/useMethodCall';
import { UaNode } from '../Adressspace/types';
import { useSocket } from '../../hooks/use-socket';
interface MessageControllerProps {
  pendingJoints: number[];
  setPendingJoints: (joints: number[] | null) => void;
}

function MessageController({ pendingJoints, setPendingJoints }: MessageControllerProps) {
  //const [pending, setPending] = useState(null);
  // pending: null | { id: string, payload: any, ts: number }

  //   const onMouseUp = (e, nodeId, payload) => {
  //     e.preventDefault(); // important if inside <form>
  //     // Snapshot everything you need NOW (no stale state later)
  //     setPending({ id: nodeId, payload, ts: Date.now() });
  //   };
  const socket = useSocket();

  const {
    isOpen: methodDialogOpen,
    result: methodResult,
    isLoading: methodLoading,
    directCallMethod,
  } = useMethodCall('opc.tcp://127.0.0.1:4840/freeopcua/server/', socket as any);

  const tmpNode: UaNode = {
    nodeId: 'ns=4;s=Go To',
    displayName: 'Go To Node',
    nodeClass: 'Method',
  };

  useEffect(() => {
    if (!pendingJoints) return;

    const controller = new AbortController();

    (async () => {
      try {
        directCallMethod(tmpNode, {
          mode: 'automatic',
          joints: JSON.stringify(pendingJoints),
        });
        // success handling here
      } catch (err) {
        // AbortError is normal when a new pending action replaces the old
        if (err?.name !== 'AbortError') console.error(err);
      } finally {
        // Clear so we don't re-run for the same action
        setPendingJoints(null);
      }
    })();

    return () => controller.abort();
  }, [pendingJoints]);

  return <></>;
}

export default MessageController;
