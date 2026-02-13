// provides the global state of the URL

import { createContext, type PropsWithChildren, useContext } from 'react';

interface UrlContextType {
  url: string | null;
  setUrl: (url: string | null) => void;
}

export const UrlContext = createContext<UrlContextType>({
  url: null,
  setUrl: () => {},
});

export type UrlProviderProps = PropsWithChildren<{
  readonly url: string | null;
  readonly setUrl: (url: string | null) => void;
}>;

export function UrlProvider(props: UrlProviderProps) {
  return (
    <UrlContext.Provider value={{ url: props.url, setUrl: props.setUrl }}>
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
