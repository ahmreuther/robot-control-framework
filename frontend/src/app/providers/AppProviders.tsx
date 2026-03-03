import type { PropsWithChildren } from 'react';

import { LoadingProvider } from '../../contexts/LoadingContext';
import { LogProvider } from '../../contexts/LogContext';
import { RobotInfoProvider } from '../../contexts/RobotInfoContext';
import { ServersProvider } from '../../contexts/ServersContext';
import { SyncProvider } from '../../contexts/SyncContext';
import { UrlProvider } from '../../contexts/UrlContext';
import { SolverConfigProvider } from '../../contexts/useSolverConfigContext';
import { SocketProvider } from '../../hooks/use-socket';

const WEBSOCKET_URL = 'ws://127.0.0.1:8001/ws';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ServersProvider>
      <LogProvider>
        <LoadingProvider>
          <SolverConfigProvider>
            <RobotInfoProvider>
              <SyncProvider>
                <SocketProvider url={WEBSOCKET_URL}>
                  <UrlProvider>{children}</UrlProvider>
                </SocketProvider>
              </SyncProvider>
            </RobotInfoProvider>
          </SolverConfigProvider>
        </LoadingProvider>
      </LogProvider>
    </ServersProvider>
  );
}
