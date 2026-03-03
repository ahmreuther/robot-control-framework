import { useState } from 'react';
import { Group, Panel } from 'react-resizable-panels';

import { useUrlContext } from '../../contexts/UrlContext';
import { useSocket } from '../../hooks/use-socket';
import { ASpaceBody } from './ASpaceBody';
import { useEventSubscriptions } from './hooks/useEventSubscriptions';
import { useMethodCall } from './hooks/useMethodCall';
import { useSubscriptions } from './hooks/useSubscriptions';
import { ASpaceDetailsPanel } from './panels/ASpaceDetailsPanel';
import { EventsPanel } from './panels/EventsPanel';
import { MethodDialog } from './panels/MethodDialog';
import { VariablesPanel } from './panels/VariablesPanel';
import { QuickActionsPanel } from './QuickActionsPanel';
import type { UaNode } from './types';

export function ASpaceWindow() {
  const { url: opcUaUrl } = useUrlContext();
  const socket = useSocket();
  const ws = socket as WebSocket | null;
  const [selectedNode, setSelectedNode] = useState<UaNode | null>(null);
  const [bodyKey, setBodyKey] = useState(0);
  const { subscriptions, addSubscription, removeSubscription } = useSubscriptions(
    opcUaUrl,
    ws,
  );
  const { eventSubscriptions, addEventSubscription, removeEventSubscription } = useEventSubscriptions(
    opcUaUrl,
    ws,
  );

  const {
    isOpen: methodDialogOpen,
    methodNode,
    inputs,
    inputValues,
    result: methodResult,
    isLoading: methodLoading,
    openMethodDialog,
    closeMethodDialog,
    setInputValue,
    callMethod,
  } = useMethodCall(opcUaUrl, ws);

  const handleReload = () => {
    setBodyKey((prev) => prev + 1);
  };

  return (
    <section className="panel h-full flex flex-col">
      <header className="panel-header">
        <div className="panel-title flex">
          Addressspace
          <div className="panel-subtitle">{opcUaUrl ? opcUaUrl : 'not connected'}</div>
        </div>
        <button onClick={handleReload} className="button-ghost">
          ↻
        </button>
      </header>
      <div className="panel-body flex h-full overflow-y-hidden gap-2">
        <Group orientation="horizontal">
          <Panel defaultSize={'40%'}>
            <Group orientation="vertical">
              <Panel>
                <div className="panel h-full overflow-y-auto mr-2">
                  {opcUaUrl && !methodDialogOpen && (
                    <ASpaceBody
                      key={`${opcUaUrl}-${bodyKey}`}
                      opcUaUrl={opcUaUrl}
                      addSubscription={addSubscription}
                      addEventSubscription={addEventSubscription}
                      openMethodDialog={openMethodDialog}
                      onNodeSelect={setSelectedNode}
                      onRemoveEvent={removeEventSubscription}
                      onRemoveSubscription={removeSubscription}
                      subscriptions={subscriptions}
                      eventSubscriptions={eventSubscriptions}
                    />
                  )}
                  {methodDialogOpen && (
                    <MethodDialog
                      isOpen={methodDialogOpen}
                      node={methodNode}
                      inputs={inputs}
                      inputValues={inputValues}
                      result={methodResult}
                      isLoading={methodLoading}
                      onInputChange={setInputValue}
                      onCall={callMethod}
                      onClose={closeMethodDialog}
                    />
                  )}
                </div>
              </Panel>
              <Panel>
                <div className="flex-col h-full overflow-y-auto mt-2 mr-2">
                  <VariablesPanel subscriptions={subscriptions} />
                  <EventsPanel subscriptions={eventSubscriptions} />
                </div>
              </Panel>
            </Group>
          </Panel>
          <Panel>
            <Group orientation="vertical">
              <Panel>
                <div className="h-full overflow-y-hidden">
                  <ASpaceDetailsPanel node={selectedNode} opcUaUrl={opcUaUrl} />
                </div>
              </Panel>
              <Panel>
                <div className="flex-col h-full overflow-y-auto mt-2">
                  <QuickActionsPanel opcUaUrl={opcUaUrl} openMethodDialog={openMethodDialog} />
                </div>
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
    </section>
  );
}

export default ASpaceWindow;
