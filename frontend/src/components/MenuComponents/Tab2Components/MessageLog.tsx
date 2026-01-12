import { LazyLog } from "@melloware/react-logviewer";
import { useState, useEffect, useContext } from "react";
import { LogContext } from "../../../App";


function MessageLog() {
    const { logs, setLogs } = useContext(LogContext);

    function addManual() {
        setLogs(prev=> prev + "new log line\n");
    }
    
    function clearLog(){
        setLogs("Cleared\n")
    }

    return (
        <div className="flex flex-col gap-2 p-2">
            <button onClick={addManual}>
                Test Log append
            </button>
            <button onClick={clearLog}>
                Clear Log
            </button>
            <LazyLog
                extraLines={1}
                height="200"
                selectableLines
                text={logs}
            />
        </div>
    )  
}

export default MessageLog;