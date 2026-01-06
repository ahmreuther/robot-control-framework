import { LazyLog } from "@melloware/react-logviewer";
import { useState, useEffect } from "react";

function MessageLog() {
    const [logs, setLogs] = useState("Start\n");
    const [showLogs, setShowLogs] = useState(false);

    function addManual() {
        setLogs(prev => prev + "new log line\n");
    }
    
    function clearLog(){
        setLogs("Cleared\n")
    }

    useEffect(() => {
        const socket = new WebSocket("ws://127.0.0.1:8000/ws");

        socket.onmessage = (event) => {
            setLogs(prev => prev + event.data + "\n");
        };

        return () => socket.close();
    }, []);

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