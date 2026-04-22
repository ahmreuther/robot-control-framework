export function Viewport() {
  return (
    <section className="viewport-shell">
      <div className="viewport-toolbar">
        <button className="button-ghost">H</button>
        <button className="button-ghost">W</button>
        <button className="button-ghost">E</button>
        <button className="button-ghost">Q</button>
      </div>
      <div className="viewport-grid">
        <div className="robot-card viewport-robot-card">
          <div className="robot-figure" aria-hidden="true">
            <div className="robot-arm robot-arm-a" />
            <div className="robot-arm robot-arm-b" />
            <div className="robot-base" />
          </div>
          <div className="robot-meta">
            <h1>Robot Viewport</h1>
            <p>URDF renderer placeholder</p>
            <p className="code">joint_1 ... joint_6</p>
          </div>
        </div>
      </div>
    </section>
  );
}
