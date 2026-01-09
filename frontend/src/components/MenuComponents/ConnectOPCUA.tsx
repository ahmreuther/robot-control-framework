
import { Button, Input, Label, Switch } from "@heroui/react";
import { useSocket } from "../../hooks/use-socket";
import {useState, useContext} from "react";
import { LogContext } from "../../App";
import { UrlContext, useUrlContext } from "../UrlContext";
import Synchronize_Button from "./Tab2Components/Synchronise_button";
import { useSendMessage } from "../../hooks/send-message";

// Tab mit dem man Connect, Disconnect und Sync für OPC UA machen kann
function ConnectOPCUA() {
  const [url, setUrl] = useState("");
  const socket = useSocket();
  const { logs, setLogs } = useContext(LogContext);
  const { setUrl: setContextUrl } = useContext(UrlContext);
  const { sendMessage} = useSendMessage();


  // funktion um die nachricht zu versenden, man muss nur den connect type übergeben (connect/disconnect), funktioniert nur wenn die 
  //Nachricht die gesendet wird so aussieht:  "xxx|url". Die letzte url wird auch im localstorage gespeichert

  function handleConnect() {
    sendMessage("connect")
    // Setze URL im UrlContext wenn erfolgreich (wird durch Backend-Response aktualisiert)
    const trimmedUrl = url.trim();
    if (trimmedUrl) {
      setContextUrl(trimmedUrl);
    }
  }

  // meine idee von disconnect handlen, chris hatte was anderes implementiert
  function handleDisconnect(){
    sendMessage("disconnect")
    setContextUrl(null); // URL löschen bei Disconnect
  }


  return (
      <div className="flex flex-col gap-1">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Server-Adress" className="w-64" placeholder="OPC UA Server URL" />
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

