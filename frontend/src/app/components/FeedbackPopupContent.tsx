import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
} from "@ant-design/icons";
import { Progress } from "antd";
import type { ReactNode } from "react";

export type FeedbackPopupVariant =
  | "loading"
  | "progress"
  | "success"
  | "error";

interface FeedbackPopupContentProps {
  variant: FeedbackPopupVariant;
  title: ReactNode;
  description?: ReactNode;
  progressPercent?: number | null;
  showSpinner?: boolean;
  children?: ReactNode;
}

function FeedbackPopupIcon({
  variant,
  showSpinner,
}: {
  variant: FeedbackPopupVariant;
  showSpinner: boolean;
}) {
  if (variant === "progress" && !showSpinner) {
    return null;
  }
  if (variant === "success") {
    return (
      <CheckCircleFilled
        className="feedback-popup-icon"
        style={{ color: "rgb(var(--ok))" }}
      />
    );
  }
  if (variant === "error") {
    return (
      <CloseCircleFilled
        className="feedback-popup-icon"
        style={{ color: "rgb(var(--bad))" }}
      />
    );
  }
  if (showSpinner) {
    return (
      <span className="feedback-popup-spinner">
        <LoadingOutlined />
      </span>
    );
  }
  return <span className="feedback-popup-dot" aria-hidden="true" />;
}

export default function FeedbackPopupContent({
  variant,
  title,
  description,
  progressPercent,
  showSpinner = variant === "loading",
  children,
}: FeedbackPopupContentProps) {
  const clampedPercent =
    progressPercent == null
      ? null
      : Math.max(0, Math.min(100, Math.round(progressPercent)));

  return (
    <div className={`feedback-popup ${variant}`}>
      <div className="feedback-popup-header">
        <FeedbackPopupIcon variant={variant} showSpinner={showSpinner} />
        <div className="feedback-popup-copy">
          <div className="feedback-popup-title">{title}</div>
          {description ? (
            <div className="feedback-popup-description">{description}</div>
          ) : null}
        </div>
      </div>
      {clampedPercent != null ? (
        <div className="feedback-popup-progress">
          <Progress
            percent={clampedPercent}
            size="small"
            status="active"
            strokeColor="rgb(var(--brand))"
            trailColor="rgb(var(--panel-border) / 0.12)"
            strokeLinecap="butt"
            showInfo={false}
          />
        </div>
      ) : null}
      {children ? <div className="feedback-popup-body">{children}</div> : null}
    </div>
  );
}
