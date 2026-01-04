import { Button, Input, Label, Switch } from "@heroui/react";
import { useState } from "react";
import { useSocket } from "../hooks/use-socket";

// type ConnectMessage = {
//   type: "connect";
//   url: string;
//   password: string
// }

function ConnectOPCUA() {
  const [url, seturl] = useState("");
  const socket = useSocket();

  function send_message(connectType: string ){
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      alert("Please enter a valid OPC UA Server URL.");
      return;
    }

    const msg = `${connectType}|${trimmedUrl}`;

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(msg);
      console.log("Sent:", msg);
    } else {
      alert(`WebSocket is not ready! (State: ${socket.readyState})`);
    }

    localStorage.setItem("lastOpcUaUrl", trimmedUrl);
  }




  function handleConnect() {
    
    // const msg = JSON.stringify({
    //   type: "connect",
    //   url: trimmedUrl,
    //   password: "",
    // } satisfies ConnectMessage)
    send_message("connect")
  }

  function handleDisconnect(){
    send_message("disconnect")
  }


  return (
    <div>
      <Input value={url} onChange={(e) => seturl(e.target.value)} aria-label="Server-Adress" className="w-64" placeholder="OPC UA Server URL" />
      <Button onPress={handleConnect}>Connect</Button>
      <Button onPress={handleDisconnect}>Disconnect</Button>
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

