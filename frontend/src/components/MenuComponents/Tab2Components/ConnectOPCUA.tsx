
import { Button, Input } from "@heroui/react";
import { useState, useContext, useEffect } from "react";
import { UrlContext } from "../../../contexts/UrlContext";
import Synchronize_Button from "./SynchroniseButton";
import { useSendMessage } from "../../../hooks/send-message";

// Tab mit dem man Connect, Disconnect und Sync für OPC UA machen kann
function ConnectOPCUA() {
  const [url, setUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const { setUrl: setContextUrl } = useContext(UrlContext);
  const { sendMessage } = useSendMessage();

  // Load saved URL from localStorage on mount
  useEffect(() => {
    const lastUrl = localStorage.getItem("lastOpcUaUrl");
    if (lastUrl) {
      setSavedUrl(lastUrl);
    }
  }, []);



  function handleConnect() {
    sendMessage("connect")
    // Setze URL im UrlContext wenn erfolgreich (wird durch Backend-Response aktualisiert)
    const trimmedUrl = url.trim();
    if (trimmedUrl) {
      setContextUrl(trimmedUrl);
    }
  }

  function handleDisconnect(){
    sendMessage("disconnect")
    setContextUrl(null); // URL löschen bei Disconnect
  }


  return (
      <div className="flex flex-col gap-3 p-4 bg-black bg-opacity-70 rounded border border-white/20">
          <div className="font-bold text-sm uppercase tracking-wide text-white/90 pb-2 border-b border-white/20">OPC-UA Connection</div>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Server-Adress"
            className="w-full text-xs"
            placeholder="OPC UA Server URL"
            list={savedUrl ? "savedUrls" : undefined}
          />
        {savedUrl && (
          <datalist id="savedUrls">
            <option value={savedUrl}>{savedUrl}</option>
          </datalist>
        )}
      <div className="flex gap-2">
        <Button 
          onPress={handleConnect}
          className="px-3 py-1 text-xs bg-white/10 text-white rounded hover:bg-white/20"
        >
          Connect
        </Button>
        <Button 
          onPress={handleDisconnect}
          className="px-3 py-1 text-xs bg-white/10 text-white rounded hover:bg-white/20"
        >
          Disconnect
        </Button>
      </div>
        <Synchronize_Button />
      </div>
    );
}

export default ConnectOPCUA;

