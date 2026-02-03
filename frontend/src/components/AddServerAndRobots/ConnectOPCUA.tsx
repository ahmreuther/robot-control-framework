import { Button, Input } from "@heroui/react";
import { useState, useContext, useEffect } from "react";
import { UrlContext } from "../../contexts/UrlContext";
import Synchronize_Button from "../MenuComponents/Tab2Components/SynchroniseButton";
import { useSendMessage } from "../../hooks/send-message";
import { RobotInfoContext } from "../../contexts/RobotInfoContext";
import { type JointStateManager } from "../../hooks/useJointState";

export interface ConnectOPCUAProps {
  jointManager: JointStateManager;
  addServer: (name: string, connectedUrl: string, backendport: string | null) => void;
}

// Tab mit dem man Connect, Disconnect und Sync für OPC UA machen kann
function ConnectOPCUA({ jointManager, addServer }: ConnectOPCUAProps) {
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState("opc.tcp://127.0.0.1:4840/freeopcua/server/");
  const [serverName, setServerName] = useState("");
  const { setUrl } = useContext(UrlContext);
  const { sendMessage } = useSendMessage();
  const isConnected = useContext(RobotInfoContext).robotStatus === "Connected";

  // Load saved URL from localStorage on mount
  useEffect(() => {
    const lastUrl = localStorage.getItem("lastOpcUaUrl");
    if (lastUrl) {
      setSavedUrl(lastUrl);
    }
  }, []);

  function handleConnect() {
    sendMessage("connect", localUrl);
    // Setze URL im UrlContext wenn erfolgreich (wird durch Backend-Response aktualisiert)
    const trimmedUrl = localUrl.trim();
    if (trimmedUrl) {
      setUrl(trimmedUrl);
    }
  }


  return (
    <div className="flex flex-col gap-3 p-4 bg-black bg-opacity-70 rounded border border-white/20">
      <div className="font-bold text-sm uppercase tracking-wide text-white/90 pb-2 border-b border-white/20">
        OPC-UA Connection
      </div>
      <Input
        value={localUrl}
        onChange={(e) => setLocalUrl(e.target.value)}
        aria-label="Server-Adress"
        className="w-full text-xs"
        placeholder="OPC UA Server URL"
        list={savedUrl ? "savedUrls" : undefined}
        disabled={isConnected}
      />
      {savedUrl && (
        <datalist id="savedUrls">
          <option value={savedUrl}>{savedUrl}</option>
        </datalist>
      )}
      <div className="mt-2">
        <Input
          value={serverName}
          onChange={(e) => setServerName(e.target.value)}
          aria-label="Server-Name"
          className="w-full text-xs"
          placeholder="Server name"
        />
        <div className="flex gap-2 mt-2">
          <Button
            onPress={() => {
              const trimmed = serverName.trim();
              if (trimmed) {
                addServer(trimmed, localUrl.trim(), null);
                handleConnect();
                setServerName("");
              }
            }}
            className="px-3 py-1 text-xs bg-white/10 text-white rounded hover:bg-white/20"
          >
            Add Server
          </Button>
        </div>
      </div>

      <Synchronize_Button jointManager={jointManager} />
    </div>
  );
}

export default ConnectOPCUA;