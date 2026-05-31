import { useEffect } from "react";

import { useAppFeedback } from "../../../app/context/AppFeedbackContext";

const ENVIRONMENT_LOADING_KEY = "viewport.environment";

export default function EnvironmentLoader() {
  const feedback = useAppFeedback();

  useEffect(() => {
    feedback.showLoading(ENVIRONMENT_LOADING_KEY, "Loading environment");
    return () => {
      feedback.hideLoading(ENVIRONMENT_LOADING_KEY);
    };
  }, [feedback]);

  return null;
}

