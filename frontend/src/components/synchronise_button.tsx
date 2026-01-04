
//wenn keine url connected ist kann nicht verbinden 

if (!connectedUrl) {
        this.checked = false;
        opcUaSyncEnabled = false;
        logMessageToBox('❌ No OPC UA client connected. Please connect first.');
        return;
    }

    // wenn keinen robotic namespace hat-> kann nicht verbinden 
    if (!hasRoboticsNamespace) {
        this.checked = false;
        opcUaSyncEnabled = false;
        logMessageToBox('❌ No OPC UA robotics server connected.');
        return;
    }
    opcUaSyncEnabled = this.checked; ---->> default true ? 

    const url = document.getElementById('opc-ua-url').value.trim(); //--> dann wieder url trimmen 


    // dann : wenn alles stimmt : wieder 

      socket.send(`stream joint position|${url}`);
            socket.send(`stream mode|${url}`);

    //senden -> in send_msg funktion in Opcuaconnect

    //und dann : buildet er axis to joint map? --> kann ich die copien einfach? 
    // also ich denke er copiet die bewegungen einfach die der reale roboter performt -> ich denke so, also wenn man synct ist dann kann man den
    //den arm nicht bewegen auf dem digital twin

    // falls sync enabled = false -> } 
        if (opcUaStreamActive && socket && socket.readyState === WebSocket.OPEN && url) {
            socket.send(`cancel stream joint position|${url}`);
            socket.send(`cancel stream mode|${url}`);
            opcUaStreamActive = false;
        }
        const modeField = document.getElementById('robot-mode-value');
        if (modeField) modeField.textContent = '-';
    }
});

huuii


// in dem container wird noch die propagation gestoppt was immer das heißt : 

const opcUaSyncToggleContainer = document.getElementById('opc-ua-sync-toggle-container');
opcUaSyncToggleContainer.addEventListener('click', function (e) {
    e.stopPropagation();
}, true);