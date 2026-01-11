
import { Button, Input } from "@heroui/react";
import { useState, useContext, useEffect } from "react";
import { UrlContext } from "../UrlContext";
import Synchronize_Button from "./Tab2Components/Synchronise_button";
import { useSendMessage } from "../../hooks/send-message";

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
      <div className="flex flex-col gap-1">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Server-Adress"
            className="w-64"
            placeholder="OPC UA Server URL"
            list={savedUrl ? "savedUrls" : undefined}
          />
        {savedUrl && (
          <datalist id="savedUrls">
            <option value={savedUrl}>{savedUrl}</option>
          </datalist>
        )}
      <div />
      <div className="">
        <Button onPress={handleConnect}>Connect</Button>
        <Button onPress={handleDisconnect}>Disconnect</Button>
      </div>
      <div />
        <Synchronize_Button />
      </div>
    );
}

export default ConnectOPCUA;

