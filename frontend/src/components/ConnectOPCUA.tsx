import { Button, Input, Label, Switch } from "@heroui/react";
import { useState, useContext } from "react";
import { useSocket } from "../hooks/use-socket";
import { LogContext } from "/src/App";

// type ConnectMessage = {
//   type: "connect";
//   url: string;
//   password: string
// }

function ConnectOPCUA() {
  const [url, seturl] = useState("");
  const socket = useSocket();
  const { logs, setLogs } = useContext(LogContext);

  function handleConnect() {
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      setLogs(prev=> prev + "Please enter a valid OPC UA Server URL.\n");
      return;
    }

    const msg = `connect|${trimmedUrl}`;
    // const msg = JSON.stringify({
    //   type: "connect",
    //   url: trimmedUrl,
    //   password: "",
    // } satisfies ConnectMessage)

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(msg);
      setLogs(prev=> prev + "Sent:" + msg + "\n");
    } else {
      setLogs(prev=> prev + `WebSocket is not ready! (State: ${socket.readyState})` + "\n");
    }

    localStorage.setItem("lastOpcUaUrl", trimmedUrl);
  }


  return (
    <div>
      <Input value={url} onChange={(e) => seturl(e.target.value)} aria-label="Server-Adress" className="w-64" placeholder="OPC UA Server URL" />
      <Button onPress={handleConnect}>Connect</Button>
      <Button onPress={() => setLogs(prev=> prev + "Disconnect pressed\n")}>Disconnect</Button>
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

