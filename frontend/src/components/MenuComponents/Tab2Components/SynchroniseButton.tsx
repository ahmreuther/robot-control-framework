// Skizze für die synchronisierungs button logik, übernommen aus dem Vorgängerprojekt

import { useUrlContext } from "../../../contexts/UrlContext";
import { useLogContext } from "../../../contexts/LogContext";
import { useState } from "react";
import { Switch, Label } from "@heroui/react";
import {useSendMessage} from "../../../hooks/send-message";


export default function Synchronize_Button() {

    const { url: connectedUrl } = useUrlContext();      //aktuelle verbundene url(oder nicht)
    const {setLogs} = useLogContext();
    const [isSyncActive, setIsSyncActive] = useState(false); // darf stream aktiv sein
    const { sendMessage } = useSendMessage(); 

    function synchronize(toggleState: boolean): boolean {


        if(!connectedUrl){
            //this checked is false 
            // opcUaSyncEnabled = false ?
            console.log("No OPC UA client connected. Please connect first.");
            setLogs(prev => prev + "❌ No OPC UA client connected. Please connect first.\n");
            return (!toggleState);//--> siehe wahrheitstabelle papier 
        }   

        //---------------------------------------------------------------

        // // wenn keinen robotic namespace hat-> kann nicht verbinden -> was ist der robotics namespace ? was ist der unterschied zu connectedUrl? 
        // if (!hasRoboticsNamespace) {
        //     setLogs(prev => prev+   "❌ No OPC UA robotics server connected.\n");

        // button wird ausgeschaltet
        if (toggleState){
                sendMessage("stream joint position");
                sendMessage("stream mode");
                setLogs(prev => prev + "🔄 Synchronization activated.\n");

                 //liest joint array werte aus dem backend aus

        }
        else {
                sendMessage("cancel stream joint position");
                sendMessage("cancel stream mode");
                setLogs(prev => prev + "⏸️ Synchronization deactivated.\n");

                //liest joint array werte aus dem backend aus und schickt sie dann in einem number array an dennis
        }
        return true;


    }
    return (
        <Switch
        // next always changes the state :true->false, false->true
        // der switch ist immer selected je nach dem ob isSyncActive true oder false ist(optisch) 
            isSelected={isSyncActive}
            onChange={(next) => {
                const maySwitch = synchronize(next);
                if (!maySwitch) return; 
                setIsSyncActive(next);      
        }}>
            <Switch.Control>
                <Switch.Thumb />
            </Switch.Control>
            <Label className="text-sm text-white">Syncronize OPC UA Server</Label>
        </Switch>

        )
}


// in dem container wird noch die propagation gestoppt was immer das heißt : 

// const opcUaSyncToggleContainer = document.getElementById('opc-ua-sync-toggle-container');
// opcUaSyncToggleContainer.addEventListener('click', function (e) {
//     e.stopPropagation();
// }, true);