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
        <div className="flex flex-col gap-3 p-4 bg-black bg-opacity-70 rounded border border-white/20">
            <div className="font-bold text-sm uppercase tracking-wide text-white/90">Message Log</div>
            <div className="flex gap-2">
                <button 
                    onClick={addManual}
                    className="px-3 py-1 text-xs bg-white/10 text-white rounded hover:bg-white/20 transition-colors"
                >
                    Test Log
                </button>
                <button 
                    onClick={clearLog}
                    className="px-3 py-1 text-xs bg-white/10 text-white rounded hover:bg-white/20 transition-colors"
                >
                    Clear
                </button>
            </div>
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