import {Input} from "@heroui/react";
import {Button} from "@heroui/react";
import {Label, Switch} from "@heroui/react";
import { getSocket } from "./Connect";
import { useRef, useState} from "react";



function ConnectOPCUA() {


    const [url, seturl] = useState("");

    function handleConnect() {
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      alert("Please enter a valid OPC UA Server URL.");
      return;
    }

    const message = `connect|${trimmedUrl}`;
    const socket = getSocket();

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(message);
      console.log("Sent:", message);
    } else {
      alert("WebSocket is not connected.");
    }

    localStorage.setItem("lastOpcUaUrl", trimmedUrl);
  }


  return (
      <div className="flex flex-col gap-1">
          <Input value={url} onChange={(e) => seturl(e.target.value)} aria-label="Server-Adress" className="w-64" placeholder="OPC UA Server URL" />
      <div />
      <div className="">
        <Button onPress={handleConnect}>Connect</Button>
        <Button onPress={() => console.log("Button pressed")}>Disconnect</Button>
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
