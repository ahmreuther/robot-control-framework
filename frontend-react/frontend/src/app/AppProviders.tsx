import type { PropsWithChildren } from 'react';

import { LogProvider } from '../features/address-space/contexts/LogContext';
import { RobotInfoProvider } from '../features/robot-control/contexts/RobotInfoContext';
import { SyncProvider } from '../features/robot-control/contexts/SyncContext';
import { SolverConfigProvider } from '../features/robot-control/contexts/useSolverConfigContext';
import { ServersProvider } from '../features/server-management/contexts/ServersContext';
import { UrlProvider } from '../features/server-management/contexts/UrlContext';
import { SocketProvider } from '../features/socket/hooks/useSocket';
import { LoadingProvider } from './contexts/LoadingContext';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ServersProvider>
      <LogProvider>
        <LoadingProvider>
          <SolverConfigProvider>
            <RobotInfoProvider>
              <SyncProvider>
                <SocketProvider>
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
