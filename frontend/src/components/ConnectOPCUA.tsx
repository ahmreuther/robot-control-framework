import {Input} from "@heroui/react";
import {Button} from "@heroui/react";
import {Label, Switch} from "@heroui/react";
import { initSocket,getSocket } from "./Connect";
import { useRef, useState} from "react";



function ConnectOPCUA() {


    const [url, seturl] = useState("");

    initSocket("ws://127.0.0.1:8000/ws");

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
        <div>
            <Input value={url} onChange={(e) => seturl(e.target.value)} aria-label="Server-Adress" className="w-64" placeholder="OPC UA Server URL" />
            <Button onPress={handleConnect}>Connect</Button>
            <Button onPress={() => console.log("Button pressed")}>Disconnect</Button>
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
