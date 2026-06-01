import { App as AntdApp } from "antd";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import FeedbackPopupContent from "../components/FeedbackPopupContent";

export interface AppFeedbackErrorOptions {
  description?: string;
  key?: string;
  duration?: number;
}

export interface AppFeedbackContextValue {
  showLoading(
    key: string,
    content: ReactNode,
    options?: { spinner?: boolean },
  ): void;
  hideLoading(key: string): void;
  showSuccess(content: string): void;
  showError(title: string, options?: AppFeedbackErrorOptions): void;
  withLoading<T>(
    key: string,
    loadingContent: ReactNode,
    operation: () => Promise<T>,
    options?: {
      successContent?: string;
      errorTitle?: string;
      errorDescription?: string;
      errorDuration?: number;
    },
  ): Promise<T>;
}

const AppFeedbackContext = createContext<AppFeedbackContextValue | null>(null);

interface AntdFeedbackApis {
  message: ReturnType<typeof AntdApp.useApp>["message"];
  notification: ReturnType<typeof AntdApp.useApp>["notification"];
}

function AppFeedbackBridge({
  onReady,
}: {
  onReady: (apis: AntdFeedbackApis) => void;
}) {
  const { message, notification } = AntdApp.useApp();

  useEffect(() => {
    onReady({ message, notification });
  }, [message, notification, onReady]);

  return null;
}

function AppFeedbackProviderInner({
  children,
  apis,
}: {
  children: ReactNode;
  apis: AntdFeedbackApis | null;
}) {
  const loadingKeysRef = useRef(new Set<string>());

  const hideLoading = useCallback(
    (key: string) => {
      if (!apis) {
        return;
      }
      if (!loadingKeysRef.current.has(key)) {
        return;
      }
      apis.message.destroy(key);
      loadingKeysRef.current.delete(key);
    },
    [apis],
  );

  const showLoading = useCallback(
    (key: string, content: ReactNode, options?: { spinner?: boolean }) => {
      if (!apis) {
        return;
      }
      apis.message.open({
        key,
        content:
          typeof content === "string" ? (
            <FeedbackPopupContent
              variant="loading"
              title={content}
              showSpinner={options?.spinner !== false}
            />
          ) : (
            content
          ),
        duration: 0,
      });
      loadingKeysRef.current.add(key);
    },
    [apis],
  );

  const showSuccess = useCallback(
    (content: string) => {
      if (!apis) {
        return;
      }
      apis.message.open({
        key: `success.${content}`,
        content: <FeedbackPopupContent variant="success" title={content} />,
        duration: 2,
      });
    },
    [apis],
  );

  const showError = useCallback(
    (title: string, options?: AppFeedbackErrorOptions) => {
      if (!apis) {
        return;
      }
      apis.message.open({
        key: options?.key,
        content: (
          <FeedbackPopupContent
            variant="error"
            title={title}
            description={options?.description}
          />
        ),
        duration: options?.duration ?? 5,
      });
    },
    [apis],
  );

  const withLoading = useCallback<AppFeedbackContextValue["withLoading"]>(
    async (key, loadingContent, operation, options) => {
      showLoading(key, loadingContent);
      try {
        const result = await operation();
        hideLoading(key);
        if (options?.successContent) {
          showSuccess(options.successContent);
        }
        return result;
      } catch (error) {
        hideLoading(key);
        const description =
          options?.errorDescription ??
          (error instanceof Error ? error.message : String(error));
        showError(options?.errorTitle ?? "Operation failed", {
          description,
          key,
          duration: options?.errorDuration,
        });
        throw error;
      }
    },
    [hideLoading, showError, showLoading, showSuccess],
  );

  const value = useMemo<AppFeedbackContextValue>(
    () => ({
      showLoading,
      hideLoading,
      showSuccess,
      showError,
      withLoading,
    }),
    [hideLoading, showError, showLoading, showSuccess, withLoading],
  );

  return (
    <AppFeedbackContext.Provider value={value}>
      {children}
    </AppFeedbackContext.Provider>
  );
}

export function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const [apis, setApis] = useState<AntdFeedbackApis | null>(null);

  return (
    <>
      <AntdApp>
        <AppFeedbackBridge onReady={setApis} />
      </AntdApp>
      <AppFeedbackProviderInner apis={apis}>{children}</AppFeedbackProviderInner>
    </>
  );
}

export function useAppFeedback(): AppFeedbackContextValue {
  const context = useContext(AppFeedbackContext);
  if (!context) {
    throw new Error("useAppFeedback must be used within an AppFeedbackProvider.");
  }
  return context;
}
