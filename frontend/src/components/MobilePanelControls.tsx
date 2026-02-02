import React from 'react';

type MobilePanelState = 'none' | 'main' | 'side' | 'bot';

interface Props {
  className?: string;
  mobilePanelState: MobilePanelState;
  setMobilePanelState: (s: MobilePanelState) => void;
  showClose?: boolean;
}

export default function MobilePanelControls({ className = '', mobilePanelState, setMobilePanelState, showClose = false }: Props) {
  return (
    <div className={className}>
      <button
        className={`px-2 py-1 rounded ${mobilePanelState === 'main' ? 'bg-blue-600' : 'bg-gray-700'}`}
        onClick={() => setMobilePanelState('main')}
        aria-pressed={mobilePanelState === 'main'}
        aria-label="Show main panel"
      >
        Main
      </button>

      <button
        className={`px-2 py-1 rounded ${mobilePanelState === 'side' ? 'bg-blue-600' : 'bg-gray-700'}`}
        onClick={() => setMobilePanelState('side')}
        aria-pressed={mobilePanelState === 'side'}
        aria-label="Show side panel"
      >
        Side
      </button>

      <button
        className={`px-2 py-1 rounded ${mobilePanelState === 'bot' ? 'bg-blue-600' : 'bg-gray-700'}`}
        onClick={() => setMobilePanelState('bot')}
        aria-pressed={mobilePanelState === 'bot'}
        aria-label="Show bottom panel"
      >
        Bot
      </button>

      {showClose && (
        <button className="px-2 py-1 rounded bg-gray-700" onClick={() => setMobilePanelState('none')} aria-label="Close overlay">✕</button>
      )}
    </div>
  );
}
