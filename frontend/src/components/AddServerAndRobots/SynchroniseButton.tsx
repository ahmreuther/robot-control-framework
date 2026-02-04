import { useUrlContext } from "../../contexts/UrlContext";
import { useLogContext } from "../../contexts/LogContext";
import { useState, useContext } from "react";
import { Switch, Label } from "@heroui/react";
import { useSendMessage } from "../../hooks/send-message";
import { RobotInfoContext } from "../../contexts/RobotInfoContext";
import { type JointStateManager, WRITER_ID, WRITER_PRIORITY } from "../../hooks/useJointState";

export interface SynchronizeButtonProps {
    jointManager: JointStateManager
}

export default function Synchronize_Button({ jointManager }: SynchronizeButtonProps) {
    const { url: connectedUrl } = useUrlContext();      //aktuelle verbundene url(oder nicht)
    const { setLogs } = useLogContext();
    const [isSyncActive, setIsSyncActive] = useState(false); // darf stream aktiv sein
    const { sendMessage } = useSendMessage();

    const axleValues = useContext(RobotInfoContext).axleValues;

    const [switchState, setToggle] = useState(false);

    const toggle = () => {
      setToggle(prev => !prev);
    };

    function synchronize(toggleState: boolean): boolean {
        if (!connectedUrl) {
            console.log("No OPC UA client connected. Please connect first.");
            setLogs(prev => prev + "❌ No OPC UA client connected. Please connect first.\n");
            return (!toggleState);
        }

        if (toggleState) {
            sendMessage("stream joint position");
            sendMessage("stream mode");
            setLogs(prev => prev + "🔄 Synchronization activated.\n");
            
            jointManager.mountWriter(WRITER_ID.SYN, WRITER_PRIORITY.SYN);
        } else {
            sendMessage("cancel stream joint position");
            sendMessage("cancel stream mode");
            setLogs(prev => prev + "⏸️ Synchronization deactivated.\n");
            jointManager.unmountWriter(WRITER_ID.SYN);
        }
        return true;
    }

    return (
        // <Switch
        //     isSelected={isSyncActive}
        //     onChange={(next) => {
        //         const maySwitch = synchronize(next);
        //         if (!maySwitch) return;
        //         setIsSyncActive(next);
        //     }}>
        //     <Switch.Control>
        //         <Switch.Thumb />
        //     </Switch.Control>
        //     <Label className="text-sm text-white">Syncronize OPC UA Server</Label>
        // </Switch>
        <button
            className="button-ghost"
            onClick={() => {
                toggle();
                 const maySwitch = synchronize(switchState);
                 if (!maySwitch) return;
                 setIsSyncActive(switchState);
             }}
        >
            Sync
        </button>
    );
}