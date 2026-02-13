import React, { useEffect, useState } from 'react';

import type { JointStateManager } from '../../hooks/useJointState';

interface JointManagerPanelProps {
  jointManager: JointStateManager;
}

export function JointManagerPanel({ jointManager }: JointManagerPanelProps) {
  const [angles, setAngles] = useState<number[]>(jointManager.getAngles());
  const [activeWriter, setActiveWriter] = useState(jointManager.getActiveWriter());

  useEffect(() => {
    const unsub = jointManager.subscribe(setAngles);
    const interval = setInterval(() => {
      setActiveWriter(jointManager.getActiveWriter());
    }, 500);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [jointManager]);

  return (
    <div className="bg-black/80 text-white p-3 rounded border border-white/20 text-xs max-w-xs">
      <div className="font-bold mb-2">Joint Manager State</div>
      <div className="mb-1">Angles: {angles.map((a) => a.toFixed(3)).join(', ')}</div>
      <div className="mb-1">
        Active Writer:{' '}
        {activeWriter ? `${activeWriter.id} (priority ${activeWriter.priority})` : 'None'}
      </div>
      <div className="mb-1">Listeners: {jointManager.listeners.size}</div>
    </div>
  );
}
