// SubscriptionsPanel.tsx - UI für Variable-Subscriptions

import { Subscription } from "../hooks/useSubscriptions";

type SubscriptionsPanelProps = {
  subscriptions: Subscription[];
  onRemove: (nodeId: string) => void;
};

export const SubscriptionsPanel = ({subscriptions, onRemove}:SubscriptionsPanelProps) => {
  return (
    <div style={{ marginTop: 16, borderTop: "1px solid #2b2b2b", paddingTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ color: "#fff" }}>Subscriptions</strong>
        <div style={{ color: "#888", fontSize: 12 }}>{subscriptions.length} active</div>
      </div>

      {subscriptions.length === 0 && (
        <div style={{ color: "#777", fontSize: 12 }}>
          Keine Abonnements. Wähle eine Variable und klicke "Subscribe".
        </div>
      )}

      {subscriptions.map((s) => (
        <div
          key={s.nodeId}
          style={{
            marginBottom: 8,
            padding: "6px 8px",
            background: "#121212",
            borderRadius: 6,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: "#999", fontSize: 11 }}>{s.displayName}</div>
              <div style={{ color: "#666", fontSize: 10, wordBreak: "break-all" }}>
                {s.nodeId}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ color: "#999", fontSize: 11 }}>Value</div>
              <div style={{ color: "#4fc3f7", fontSize: 13, fontFamily: "monospace" }}>
                {s.value ?? "…"}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
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
