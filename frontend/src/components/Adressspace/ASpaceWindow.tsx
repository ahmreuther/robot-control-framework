import { useState, useEffect } from "react";
import { useUrlContext } from "../../contexts/UrlContext";
import { useSocket } from "../../hooks/use-socket";
import { ASpaceBody } from "./ASpaceBody";
import { UaNode } from "./types";
import { useEventSubscriptions } from "./hooks/useEventSubscriptions";
import { useMethodCall } from "./hooks/useMethodCall";
import { useSubscriptions } from "./hooks/useSubscriptions";
import { ASpaceDetailsPanel } from "./panels/ASpaceDetailsPanel";
import { MethodDialog } from "./panels/MethodDialog";

const STORAGE_KEY_EXPANDED = "addressSpace_expandedNodes";

export function ASpaceWindow(){
  const { url: opcUaUrl } = useUrlContext();
  const socket = useSocket();
  const [selectedNode, setSelectedNode] = useState<UaNode | null>(null);
  const [bodyKey, setBodyKey] = useState(0);
  const { subscriptions, addSubscription, removeSubscription } = useSubscriptions(opcUaUrl, socket as any);
  const { eventSubscriptions, addEventSubscription, removeEventSubscription } = useEventSubscriptions(opcUaUrl, socket as any);
  
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
    callMethod 
  } = useMethodCall(opcUaUrl, (socket as any));
  
  const handleReload = () => {
    localStorage.removeItem(STORAGE_KEY_EXPANDED);
    setBodyKey(prev => prev + 1);
  };

  useEffect(() => {
    localStorage.removeItem(STORAGE_KEY_EXPANDED);
  }, []);

  return (
    <section className="panel h-full flex flex-col">
      <header className="panel-header">
          <div className="panel-title flex">Addressspace 
            <div className="panel-subtitle">
              {opcUaUrl ? opcUaUrl: "not connected"}
            </div>
          </div>
        <button onClick={handleReload} className="button-ghost">↻</button>
      </header>
      <div className="panel-body flex h-full overflow-y-hidden gap-2">
        <div className="panel h-full w-1/3 overflow-y-auto">
          {opcUaUrl && !methodDialogOpen && (
            <ASpaceBody  
              key={bodyKey} 
              opcUaUrl={opcUaUrl} 
              onNodeSelect={setSelectedNode} 
              addSubscription={addSubscription} 
              addEventSubscription={addEventSubscription} 
              openMethodDialog={openMethodDialog} 
            /> 
          )}
          {methodDialogOpen &&
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
          />}
        </div>
        <div className="h-full w-2/3 overflow-y-hidden">
          <ASpaceDetailsPanel 
            node={selectedNode} 
            opcUaUrl={opcUaUrl} eventSubscriptions={eventSubscriptions} 
            onRemoveEventSubscription={removeEventSubscription} 
            variableSubscriptions={subscriptions} 
            onRemoveVariableSubscription={removeSubscription}
          />
        </div>
      </div>
    </section>
  );
};

export default ASpaceWindow;