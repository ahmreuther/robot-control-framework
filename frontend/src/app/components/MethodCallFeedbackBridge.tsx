import { useEffect, useRef } from "react";

import type { MethodCallStatusRecord } from "../../entities/server/model/store";
import { useAppFeedback } from "../context/AppFeedbackContext";
import type { ApplicationSnapshot } from "../model/applicationController";

export interface MethodCallFeedbackBridgeProps {
  snapshot: ApplicationSnapshot;
}

function feedbackKey(requestId: string): string {
  return `method.${requestId}`;
}

function loadingText(record: MethodCallStatusRecord): string {
  switch (record.method) {
    case "action:goto":
      return "Sending synchronized joint move...";
    case "halt:goto":
      return "Stopping synchronized move...";
    case "reset:goto":
      return "Resetting synchronized move...";
    case "toggleEndEffector":
      return "Switching end effector...";
    case "raw":
    default:
      return "Calling method...";
  }
}

function successText(record: MethodCallStatusRecord): string {
  switch (record.method) {
    case "action:goto":
      return "Synchronized move started";
    case "halt:goto":
      return "Synchronized move stopped";
    case "reset:goto":
      return "Synchronized move reset";
    case "toggleEndEffector":
      return "End effector updated";
    case "raw":
    default:
      return "Method call completed";
  }
}

function errorText(record: MethodCallStatusRecord): string {
  switch (record.method) {
    case "action:goto":
      return "Synchronized move failed";
    case "halt:goto":
      return "Failed to stop synchronized move";
    case "reset:goto":
      return "Failed to reset synchronized move";
    case "toggleEndEffector":
      return "End effector update failed";
    case "raw":
    default:
      return "Method call failed";
  }
}

export default function MethodCallFeedbackBridge({
  snapshot,
}: MethodCallFeedbackBridgeProps) {
  const feedback = useAppFeedback();
  const previousStatusesRef = useRef(snapshot.server.methodCallStatuses);

  useEffect(() => {
    const previousStatuses = previousStatusesRef.current;
    const nextStatuses = snapshot.server.methodCallStatuses;

    for (const [requestId, status] of Object.entries(nextStatuses)) {
      const previous = previousStatuses[requestId];
      const key = feedbackKey(requestId);

      if (status.status === "pending" && previous?.status !== "pending") {
        feedback.showLoading(key, loadingText(status));
        continue;
      }

      if (status.status === "succeeded" && previous?.status !== "succeeded") {
        feedback.hideLoading(key);
        feedback.showSuccess(successText(status));
        continue;
      }

      if (status.status === "failed" && previous?.status !== "failed") {
        feedback.hideLoading(key);
        feedback.showError(errorText(status), {
          description: status.error?.message,
          key,
        });
      }
    }

    previousStatusesRef.current = nextStatuses;
  }, [feedback, snapshot.server.methodCallStatuses]);

  return null;
}
