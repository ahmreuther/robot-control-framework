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
        className={`button-ghost ${mobilePanelState === 'main' ? 'button-ghost-active' : 'button-ghost'}`}
        onClick={() => setMobilePanelState('main')}
        aria-pressed={mobilePanelState === 'main'}
        aria-label="Show main panel"
      >
        Main
      </button>

      <button
        className={`button-ghost ${mobilePanelState === 'side' ? 'button-ghost-active' : 'button-ghost'}`}
        onClick={() => setMobilePanelState('side')}
        aria-pressed={mobilePanelState === 'side'}
        aria-label="Show side panel"
      >
        Side
      </button>

      <button
        className={`button-ghost ${mobilePanelState === 'bot' ? 'button-ghost-active' : 'button-ghost'}`}
        onClick={() => setMobilePanelState('bot')}
        aria-pressed={mobilePanelState === 'bot'}
        aria-label="Show bottom panel"
      >
        Bot
      </button>

      {showClose && (
        <button className="button-ghost" onClick={() => setMobilePanelState('none')} aria-label="Close overlay">✕</button>
      )}
    </div>
  );
}
