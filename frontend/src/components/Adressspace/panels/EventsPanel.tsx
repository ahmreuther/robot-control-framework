// EventsPanel.tsx - UI für Event-Subscriptions

import React from "react";
import { EventSubscription } from "../hooks/useEventSubscriptions";

type EventsPanelProps = {
  eventSubscriptions: EventSubscription[];
  onRemove: (nodeId: string) => void;
};

export const EventsPanel: React.FC<EventsPanelProps> = ({
  eventSubscriptions,
  onRemove,
}) => {
  return (
    <div style={{ marginTop: 16, borderTop: "1px solid #2b2b2b", paddingTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ color: "#fff" }}>Event Subscriptions</strong>
        <div style={{ color: "#888", fontSize: 12 }}>{eventSubscriptions.length} active</div>
      </div>

      {eventSubscriptions.length === 0 && (
        <div style={{ color: "#777", fontSize: 12 }}>
          Keine Event-Abonnements. Wähle ein Object und klicke "Subscribe Events".
        </div>
      )}

      {eventSubscriptions.map((s) => (
        <div
          key={s.nodeId}
          style={{
            marginBottom: 8,
            padding: "6px 8px",
            background: "#121012",
            borderRadius: 6,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <div style={{ color: "#999", fontSize: 11 }}>{s.displayName}</div>
            <div style={{ color: "#666", fontSize: 10, wordBreak: "break-all" }}>
              {s.nodeId}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => onRemove(s.nodeId)}
              style={{
                padding: "3px 8px",
                fontSize: 11,
                background: "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 4,
                color: "#ccc",
                cursor: "pointer",
              }}
            >
              Unsubscribe
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
