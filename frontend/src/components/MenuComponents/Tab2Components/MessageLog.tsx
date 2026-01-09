import { LazyLog } from "@melloware/react-logviewer";
import { useState, useEffect, useContext } from "react";
import { LogContext } from "../App";


function MessageLog() {
    const { logs, setLogs } = useContext(LogContext);
    const [showLogs, setShowLogs] = useState(false);

    function addManual() {
        setLogs(prev=> prev + "new log line\n");
    }
    
    function clearLog(){
        setLogs("Cleared\n")
    }

    return (
        <div className="fixed z-10" 
        style={{position:"relative",
            left:0,
            top:600
        }}>

            <button onClick={() => setShowLogs((prev) => !prev)}>
                {showLogs ? "Hide Logs" : "Show Logs"}
            </button>

            {showLogs && (
        <div>
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
      )}
            
        </div> 
    )  
}

export default MessageLog;