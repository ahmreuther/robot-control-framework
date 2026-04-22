import { useState } from 'react';

import { CheckRow } from '../../../shared/ui/CheckRow';

export function JointAnglesPanel() {
  const [showRadians, setShowRadians] = useState(false);
  const [showCollisionMesh, setShowCollisionMesh] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const joints = ['joint_1', 'joint_2', 'joint_3', 'joint_4', 'joint_5', 'joint_6'];

  return (
    <section className="panel panel-fill">
      <header className="panel-header">
        <div className="panel-title">Joint Angles</div>
      </header>
      <div className="panel-body stack">
        <CheckRow
          label="Collision Mesh"
          checked={showCollisionMesh}
          onChange={setShowCollisionMesh}
        />
        <CheckRow label="Show Radians" checked={showRadians} onChange={setShowRadians} />
        <CheckRow
          label="Show Work Envelope"
          checked={showWorkspace}
          onChange={setShowWorkspace}
        />

        <div className="placeholder-divider" />
        <div className="button-row">
          <select className="input-ghost compact-select" defaultValue="medium">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button className="button-ghost">Generate</button>
        </div>

        <div className="joint-list">
          {joints.map((joint, index) => (
            <div className="joint-row" key={joint}>
              <div className="joint-row-label">
                <span>{joint}</span>
                <span className="muted">{showRadians ? '0.000 rad' : '0.0 deg'}</span>
              </div>
              <input className="slider" type="range" min="-180" max="180" value={0} readOnly />
              <div className="joint-row-limits">
                <span>-{180 - index * 5}</span>
                <span>{180 - index * 5}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
