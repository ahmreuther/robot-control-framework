import { createContext, useContext, useState, type PropsWithChildren } from 'react';

type SyncContextType = {
  isSyncActive: boolean;
  setIsSyncActive: (active: boolean) => void;
};

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider(props: PropsWithChildren) {
  const [isSyncActive, setIsSyncActive] = useState(false);

  return (
    <SyncContext.Provider value={{ isSyncActive, setIsSyncActive }}>
      {props.children}
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSyncContext must be used within a SyncProvider');
  }
  return context;
}
