// LoadingContext.tsx - Global loading and error management with Ant Design

import React, { createContext, useContext, useCallback, type PropsWithChildren } from "react";
import { message, notification } from "antd";
import { useLogContext } from "./LogContext";

type LoadingContextType = {
  executeWithLoading: <T>(
    loadingMessage: string,
    operation: () => Promise<T>,
    options?: {
      successMessage?: string;
      errorMessage?: string;
      logToMessageLog?: boolean;
    }
  ) => Promise<T>;
};

const LoadingContext = createContext<LoadingContextType | null>(null);

export function LoadingProvider({ children }: PropsWithChildren) {
  const { setLogs } = useLogContext();

  const executeWithLoading = useCallback(
    async <T,>(
      loadingMessage: string,
      operation: () => Promise<T>,
      options?: {
        successMessage?: string;
        errorMessage?: string;
        logToMessageLog?: boolean;
      }
    ): Promise<T> => {
      const {
        successMessage,
        errorMessage = "Operation failed",
        logToMessageLog = true,
      } = options || {};

      // Show loading message
      const hideLoading = message.loading(loadingMessage, 0);

      try {
        const result = await operation();

        // Hide loading and show success
        hideLoading();
        if (successMessage) {
          message.success(successMessage, 2);
        }

        return result;
      } catch (error: any) {
        // Hide loading
        hideLoading();

        const errorMsg = error?.message || String(error);
        const timestamp = new Date().toLocaleTimeString();

        // Show error notification (persistent, manually closable)
        notification.error({
          message: errorMessage,
          description: errorMsg,
          duration: 0, // Don't auto-close
          placement: "topRight",
        });

        // Log to Message Log
        if (logToMessageLog) {
          setLogs((prev) => 
            `${prev}[${timestamp}] ERROR: ${errorMessage}\nDetails: ${errorMsg}\n`
          );
        }

        throw error; // Re-throw to allow caller to handle
      }
    },
    [setLogs]
  );

  return (
    <LoadingContext.Provider value={{ executeWithLoading }}>
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error("useLoading must be used within LoadingProvider");
  return ctx;
}
