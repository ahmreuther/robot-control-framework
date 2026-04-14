import { createContext, type PropsWithChildren, useContext, useState } from 'react';

export interface UrlContextType {
  url: string | null;
  setUrl: (url: string | null) => void;
}

export const UrlContext = createContext<UrlContextType | undefined>(undefined);

export type UrlProviderProps = PropsWithChildren<{
  readonly initialUrl?: string | null;
}>;

export function UrlProvider(props: UrlProviderProps) {
  const [url, setUrl] = useState<string | null>(props.initialUrl ?? null);

  return (
    <UrlContext.Provider value={{ url, setUrl }}>
      {props.children}
    </UrlContext.Provider>
  );
}

export function useUrlContext() {
  const context = useContext(UrlContext);
  if (!context) {
    throw new Error('useUrlContext must be used within a UrlProvider');
  }
  return context;
}
