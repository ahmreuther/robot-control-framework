import {Input} from "@heroui/react";
import {Button} from "@heroui/react";
import {Label, Switch} from "@heroui/react";

function ConnectOPCUA() {
  return (
        <div>
            <Input aria-label="Server-Adress" className="w-64" placeholder="OPC UA Server URL" />
            <Button onPress={() => console.log("Button pressed")}>Connect</Button>
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
