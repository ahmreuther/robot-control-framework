import { Component, type ReactNode } from "react";

import { useAppFeedback } from "../../../app/context/AppFeedbackContext";

interface EnvironmentErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface EnvironmentErrorBoundaryState {
  hasError: boolean;
}

class EnvironmentErrorBoundaryImpl extends Component<
  EnvironmentErrorBoundaryProps & { onError: (error: Error) => void },
  EnvironmentErrorBoundaryState
> {
  constructor(
    props: EnvironmentErrorBoundaryProps & { onError: (error: Error) => void },
  ) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): EnvironmentErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default function EnvironmentErrorBoundary({
  children,
  fallback,
}: EnvironmentErrorBoundaryProps) {
  const feedback = useAppFeedback();

  return (
    <EnvironmentErrorBoundaryImpl
      fallback={fallback}
      onError={(error) => {
        feedback.hideLoading("viewport.environment");
        feedback.showError("Failed to load environment", {
          description: `Could not load HDR environment: ${error.message}. Falling back to simple lighting.`,
        });
      }}
    >
      {children}
    </EnvironmentErrorBoundaryImpl>
  );
}

