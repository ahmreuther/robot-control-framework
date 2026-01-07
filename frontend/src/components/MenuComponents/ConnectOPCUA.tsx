
import { Button, Input, Label, Switch } from "@heroui/react";
import { useSocket } from "../../hooks/use-socket";
import {useState, useContext} from "react";
import { LogContext } from "/src/App";

// type ConnectMessage = {
//   type: "connect";
//   url: string;
//   password: string
// }

// Tab mit dem man Connect, Disconnect und Sync für OPC UA machen kann
function ConnectOPCUA() {
  const [url, seturl] = useState("");
  const socket = useSocket();
  const { logs, setLogs } = useContext(LogContext);


  // funktion um die nachricht zu versenden, man muss nur den connect type übergeben (connect/disconnect), funktioniert nur wenn die 
  //Nachricht die gesendet wird so aussieht:  "xxx|url". Die letzte url wird auch im localstorage gespeichert
  function send_message(connectType: string ){
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      setLogs(prev=> prev + "Please enter a valid OPC UA Server URL.\n");
      return;
    }

    const msg = `${connectType}|${trimmedUrl}`;

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(msg);
      setLogs(prev=> prev + "Sent:" + msg + "\n");
    } else {
      setLogs(prev=> prev + `WebSocket is not ready! (State: ${socket.readyState})` + "\n");
    }

    localStorage.setItem("lastOpcUaUrl", trimmedUrl);
  }



  // muss noch in Json umgewandelt werden, backend muss jason empfangen können
  function handleConnect() {
    
    // const msg = JSON.stringify({
    //   type: "connect",
    //   url: trimmedUrl,
    //   password: "",
    // } satisfies ConnectMessage)
    send_message("connect")
  }

  // meine idee von disconnect handlen, chris hatte was anderes implementiert
  function handleDisconnect(){
    send_message("disconnect")
  }


  return (
      <div className="flex flex-col gap-1">
          <Input value={url} onChange={(e) => seturl(e.target.value)} aria-label="Server-Adress" className="w-64" placeholder="OPC UA Server URL" />
      <div />
      <div className="">
        <Button onPress={handleConnect}>Connect</Button>
        <Button onPress={() => setLogs(prev=> prev + "Disconnect pressed\n")}>Disconnect</Button>
      </div>
      <div />
        <Switch>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Label className="text-sm text-white">Syncronize OPC UA Server</Label>
        </Switch>
      </div>
    );
}

export default ConnectOPCUA;

