import type { PropsWithChildren } from 'react';

import {
  LoadingProvider,
  LogProvider,
  RobotInfoProvider,
  ServersProvider,
  SolverConfigProvider,
  SyncProvider,
  UrlProvider,
} from './contexts';
import { SocketProvider } from '../../features/socket';

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
