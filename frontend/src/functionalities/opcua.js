//Device set / address space
function loadDeviceSet(robotRecord, opcUaUrl) {
    const encodedUrl = encodeURIComponent(opcUaUrl);
    fetch(`http://127.0.0.1:8000/device_set_rendered?url=${encodedUrl}`)
        .then(res => res.text())
        .then(html => {
            robotRecord.state.ui.addressSpaceHTML = html;
            if (robotRecord === getActiveRobot()) {
                document.getElementById('info-content').innerHTML = html;
            }
        });
}

// Subscription table helpers
function updateSubscriptionTable(nodeId, value) {
    const table = document.getElementById("subscriptions-table");
    if (!table) return;
    let row = table.querySelector(`tr[data-node-id="${nodeId}"]`);
    if (!row) {
        row = document.createElement("tr");
        row.setAttribute("data-node-id", nodeId);

        // NodeId 
        const cellNodeId = document.createElement("td");
        cellNodeId.textContent = nodeId;
        row.appendChild(cellNodeId);

        // Value 
        const cellValue = document.createElement("td");
        cellValue.className = "subscription-value";
        cellValue.textContent = value;
        row.appendChild(cellValue);

        table.querySelector("tbody").appendChild(row);
    } else {
        // Value update
        const cellValue = row.querySelector(".subscription-value");
        if (cellValue) cellValue.textContent = value;
    }
}

function removeSubscriptionRow(nodeId) {
    const table = document.getElementById("subscriptions-table");
    if (!table) return;
    const row = table.querySelector(`tr[data-node-id="${nodeId}"]`);
    if (row) row.remove();
}

// Websocket / OPCUA message handling

export function handleSocketMessage(robotRecord, event) {
    console.log("Message from server:", event.data);
    const data = event.data;
    if (data.startsWith("x|")) {
        handleProtocolMessage(robotRecord, data);
    } 
    else {
        handleStatusMessage(robotRecord, data);
    }
}

function handleProtocolMessage(robotRecord, data) {
    const manipulator = robotRecord.manipulator;
    const { ui, opcua, connectivity, interaction } = robotRecord.state;
    if (data.startsWith("x|custom:")) {
        try {
            const payload = JSON.parse(data.slice("x|custom:".length));
            if (payload.nodeId && typeof payload.value !== "undefined") {
                updateSubscriptionTable(payload.nodeId, payload.value);
                if (ui.showSubscriptionsTabOnNextCustom) {
                    const tabBtn = document.querySelector('.tab-btn[data-tab="subscriptions"]');
                    if (tabBtn) tabBtn.click();
                    ui.showSubscriptionsTabOnNextCustom = false;
                }
            }
        } catch (e) {
            console.warn("Custom subscription parse error", e);
        }
    }

    if (data.startsWith("x|unsubscribe:")) {
        let nodeId = null;
        // Check whether JSON or plain nodeId:
        const unsubArg = data.replace("x|unsubscribe:", "").trim();
        if (unsubArg.startsWith("{")) {
            // JSON
            try {
                const payload = JSON.parse(unsubArg);
                nodeId = payload.nodeId;
            } catch (e) {
                console.warn("Unsubscribe parse error", e);
            }
        } else {
            // Only nodeId as a string
            nodeId = unsubArg;
        }
        if (nodeId) {
            removeSubscriptionRow(nodeId);
        }
    }
    if (data.startsWith("x|event:")) {
        try {
            const payload = JSON.parse(data.slice("x|event:".length));
            const eventsContainer = document.getElementById("tab-events");

            const p = document.createElement("p");
            const timestamp = new Date().toLocaleTimeString();

            p.textContent = `[${timestamp}] ${JSON.stringify(payload, null, 2)}`;
            p.style.fontFamily = "monospace";
            p.style.whiteSpace = "pre-wrap";
            p.style.borderBottom = "1px solid #ccc";
            p.style.marginBottom = "5px";

            if (eventsContainer) {
                // Remove “No events captured” if present
                const noEvents = eventsContainer.querySelector('.no-events-captured');
                if (noEvents) noEvents.remove();
                eventsContainer.prepend(p);
            }
        } catch (e) {
            console.warn("Event parse error", e);
        }
    }


    if (data.startsWith("x|robotinfo:")) {
        try {
            const payload = JSON.parse(data.slice("x|robotinfo:".length));
            console.log("Robot Info:", payload);
            if (payload.manufacturer) {
                //robot state logic
                robotRecord.state.robotInfo.manufacturer = payload.manufacturer
                //ui
                const manuField = document.getElementById('robot-manufacturer');
                if (manuField) manuField.textContent = payload.manufacturer;
            }
            if (payload.model) {
                //robot state logic
                robotRecord.state.robotInfo.model = payload.model;
                //ui
                const modelField = document.getElementById('robot-model');
                if (modelField) modelField.textContent = ' ' + payload.model;
            }

            if (payload.gotoMethodNodeId) {
                opcua.metadata.gotoMethodNodeId = payload.gotoMethodNodeId ?? null;
            }

            if (payload.toggleEndEffMethodNodeId) {
                opcua.metadata.toggleEndEffMethodNodeId = payload.toggleEndEffMethodNodeId ?? null;
            }
        } catch (e) {
            console.warn("Event parse error", e);
        }
    }


    if (typeof data === "string" && data.startsWith("x|Mode:")) {
        const modeValue = data.replace("x|Mode:", "").trim();

        const modeField = document.getElementById('robot-mode-value');
        if (modeField) {
            modeField.textContent = modeValue;
        }
    }


    if (typeof data === "string" && data.startsWith("x|angles:")) {

        let dictStr = data.replace("x|angles:", "").replace(/'/g, '"');
        let anglesMsg = {};
        try {
            anglesMsg = JSON.parse(dictStr);
            if (!anglesMsg || typeof anglesMsg !== "object" || !anglesMsg.angles) {
                console.warn("❌ Parsed value is not a valid angles message:", anglesMsg);
                return;
            }
        } catch (e) {
            console.warn("❌ Error parsing axis data:", dictStr, e);
            return;
        }
        opcua.lastAngles = anglesMsg.angles;

        if (interaction.isManipulating) {

            opcua.lastAngles = anglesMsg.angles;
            return;
        }

        if (!manipulator || !manipulator.robot || !manipulator.robot.joints) {
            console.warn("⚠️ URDF Manipulator or Robot Joints not available.");
            return;
        }


        try {
            buildAxisToJointMap(robotRecord, anglesMsg);
            console.log(buildAxisToJointMap(robotRecord, anglesMsg));
        } catch (e) {
            console.warn("❌ Could not create axis→joint mapping:", e);
            return;
        }

        const unit = anglesMsg.unit;
        const jointValuesRad = {};
        for (const axisName in anglesMsg.angles) {
            const jointName = opcua.axisToJointMap[axisName];
            if (!jointName) continue;

            let value = Number(anglesMsg.angles[axisName]) || 0;
            if (unit && unit !== "C81") {
                // OPC delivers degree → convert to radiant
                value = value * Math.PI / 180;
            }
            // Radiant (C81 or null) → use directly
            jointValuesRad[jointName] = value;
        }
        const success = manipulator.setJointValues(jointValuesRad);
        if (!success) {
            console.warn("⚠️ manipulator.setJointValues() did not cause any change.");
        } else {
            console.log("✅ Angle of joints updated:", jointValuesRad);
        }
    }
}

function handleStatusMessage(robotRecord, data) {
    logMessageToBox(`🔔 ${data}`);
    const { opcua, ui, connectivity } = robotRecord.state;
    // Handle method call result
    if (data.startsWith("Method call result:")) {
        const methodStatus = document.getElementById('method-call-status');
        const spinner = document.getElementById('method-spinner');
        const statusText = document.getElementById('method-status-text');
        spinner.style.display = 'none';


        statusText.textContent = data.replace("Method call result:", "").trim();

        methodStatus.style.display = 'block';
        setTimeout(() => {
            methodStatus.style.display = 'none';
        }, 6000);
    }

    if (data.startsWith("✅ OPC UA server supports 'Robotics Namespace'")) {
        opcua.metadata.hasRoboticsNamespace = true
        updateRobotLockToggleVisibility(robotRecord);
    }

    if (data.startsWith("❌ 'Robotics Namespace' not listed")) {
        opcua.metadata.hasRoboticsNamespace = false
        updateRobotLockToggleVisibility(robotRecord);
    }


    if (data.startsWith("✅ Connected to ")) {
        connectivity.connectedUrl = data.replace("✅ Connected to ", "").trim();
        loadDeviceSet(robotRecord, connectivity.connectedUrl);
        setInfoBoxState(true); //this is duplicate logic right?
        
        document.getElementById('info-box').style.width = "750px";
        document.getElementById('properties-box').style.width = "750px";
        document.getElementById('info-toggle-btn').textContent = "collapse »";

        document.getElementById('info-content').style.width = "700px";
        document.getElementById('properties-box').style.display = 'none';
    } else if (data.startsWith("Model:")) {
        const lines = data.split(/\r?\n/);
        const modelLine = lines.find(line => line.startsWith("Model:"));
        const serialLine = lines.find(line => line.startsWith("Serial Number:"));

        const model = modelLine ? modelLine.replace("Model:", "").trim() : "unknown model";
        const serial = serialLine ? serialLine.replace("Serial Number:", "").trim() : "unknown serial";

        // Update robot stats box instead of opc-ua-status
        document.getElementById('robot-name-value').textContent = model + " (" + serial + ")";
        document.getElementById('robot-status-value').textContent = 'Connected';

    } else if (data.startsWith("\ud83d\udd0c Disconnected from ")) {
        const url = data.replace("\ud83d\udd0c Disconnected from ", "").trim();
        if (connectivity.connectedUrl === url) {
            connectivity.connectedUrl = null;
        }
        document.getElementById('info-content').innerHTML = `
        <h2>OPC UA Address Space</h2>
        <p>Disconnected from Client</p>`;
        document.getElementById('properties-box').style.display = 'none';
        document.getElementById('info-box').style.width = "450px";
        const subsTable = document.getElementById('subscriptions-table');
        if (subsTable) {
            const tbody = subsTable.querySelector('tbody');
            if (tbody) tbody.innerHTML = '';
        }
        // Update robot stats box
        document.getElementById('robot-name-value').textContent = '-';
        document.getElementById('robot-status-value').textContent = 'Not Connected';
        document.getElementById('robot-mode-value').textContent = '-';
        const opcUaSyncToggle = document.getElementById('opc-ua-sync-toggle');
        if (opcUaSyncToggle) opcUaSyncToggle.checked = false;
        opcua.syncEnabled = false;
        opcua.streamActive = false;
        // Collapse-Button 
        document.getElementById('info-toggle-btn').style.display = "none";
        // Lock-Toggle 
        opcua.metadata.hasRoboticsNamespace = null;
        updateRobotLockToggleVisibility(robotRecord);
    } else if (data.startsWith("❌ No client found")) {
        document.getElementById('info-content').innerHTML = `
        <h2>OPC UA Address Space</h2>
        <p style=\"color:rgb(255, 0, 0); font-weight: bold;\">No client found to disconnect from.</p>`;
        // Removed opc-ua-status update
        document.getElementById('properties-box').style.display = 'none';
        document.getElementById('info-box').style.width = "450px";
        // Update robot stats box
        document.getElementById('robot-name-value').textContent = '-';
        document.getElementById('robot-status-value').textContent = 'Not Connected';
        document.getElementById('robot-mode-value').textContent = '-';
    }
}

//connect / disconnect
export function connectOpcUa(robotRecord) {
    const infoToggleBtn = document.getElementById("info-toggle-btn");
    infoToggleBtn.style.display = "none";
    
    if (!robotRecord) return console.warn("No active robot.");
    const urlInput = document.getElementById('opc-ua-url');
    const url = urlInput.value.trim();

    if (!url) {
        alert('Please enter a valid OPC UA Server URL.');
        return;
    }

    const message = `connect|${url}`;

    console.log("Sending:", message);
    infoToggleBtn.style.display = "block";

    const { connectivity } = robotRecord.state;
    if (connectivity.socket && connectivity.socket.readyState === WebSocket.OPEN) {
        connectivity.socket.send(message);
        connectivity.connectedUrl = url;
        console.log(`[${robotRecord.id}] Connecting to OPC UA at ${url}`);

    } else {
        alert("WebSocket is not connected.");
    }
    robotRecord.state.connectivity.connectedUrl = url;
}

export function disconnectOpcUa(robotRecord) {
    if (!robotRecord) return console.warn("No active robot.");
    const { connectivity } = robotRecord.state;

    if (connectivity.socket && connectivity.socket.readyState === WebSocket.OPEN) {
        const url = connectivity.connectedUrl;        
        if (!url) {
            return alert("No URL specified for this robot.");
        }
        connectivity.socket.send(`disconnect|${url}`);
        connectivity.connectedUrl = null;
        document.getElementById('info-content').style.width = "400px";

        console.log(`[${robotRecord.id}] Disconnected from OPC UA at ${url}`);
    } else {
        alert("WebSocket is not connected.");
    }
}


// Node selection & subtree


// --- OPC UA Sync Toggle State ---
//done
export function handleOpcUaSyncToggle(robotRecord, event) {
    const checkbox = event.target;
    if (!robotRecord) {
        logMessageToBox('❌ No active robot.');
        return false;
    }

    const { connectivity, opcua } = robotRecord.state;

    if (!connectivity.connectedUrl) {
        checkbox.checked = false;
        opcua.syncEnabled = false;
        logMessageToBox('❌ No OPC UA client connected. Please connect first.');
        return;
    }
    if (!opcua.metadata.hasRoboticsNamespace) {
        checkbox.checked = false;
        opcua.syncEnabled = false;
        logMessageToBox('❌ No OPC UA robotics server connected.');
        return;
    }
    opcua.syncEnabled = checkbox.checked;

    const url = connectivity.connectedUrl;
    const manipulator = robotRecord.manipulator;

    if (opcua.syncEnabled) {
        if (!opcua.streamActive && connectivity.socket?.readyState === WebSocket.OPEN) {
            connectivity.socket.send(`stream joint position|${url}`);
            connectivity.socket.send(`stream mode|${url}`);
            opcua.streamActive = true;
        }
        const lastAngles = opcua.lastAngles;
        if (lastAngles && manipulator && manipulator.robot && manipulator.robot.joints) {

            try {
                buildAxisToJointMap(robotRecord, { angles: lastAngles });
            } catch (e) {
                console.warn(`[${robotRecord.id}] ❌ Could not create axis→joint mapping`, e);
                return;
            }

            const jointValuesRad = {};
            for (const axisName in lastAngles) {
                const deg = Number(lastAngles[axisName]) || 0;
                const rad = deg * Math.PI / 180;

                const jointName = opcua.axisToJointMap[axisName];
                if (jointName) {
                    jointValuesRad[jointName] = rad;
                }
            }
            manipulator.setJointValues(jointValuesRad);
        }
    } else {
        if (opcua.streamActive && connectivity.socket?.readyState === WebSocket.OPEN) {
            connectivity.socket.send(`cancel stream joint position|${url}`);
            connectivity.socket.send(`cancel stream mode|${url}`);
            opcua.streamActive = false;
        }
        const modeField = document.getElementById('robot-mode-value');
        if (modeField) modeField.textContent = '-';
    }
}


export function handleOpcUaNodeSelection(robotRecord, event) {
    if (!robotRecord) {
        logMessageToBox('❌ No active robot.');
        return false;
    }

    if (event.target.closest('#custom-context-menu')) return;

    if (!((event.target.tagName === "SUMMARY" || event.target.tagName === "SPAN") && event.target.dataset?.nodeId)) return;

    const { connectivity, ui } = robotRecord.state;

    ui.selectedNodeId = event.target.dataset.nodeId;
    ui.selectedNodeElement = event.target;

    console.log("Selected Node ID:", ui.selectedNodeId);
    showNodeProperties(event.target);

    if (!connectivity.connectedUrl) return;

    const encodedUrl = encodeURIComponent(connectivity.connectedUrl);
    const encodedNodeId = encodeURIComponent(ui.selectedNodeId);

    fetch(`http://127.0.0.1:8000/references?url=${encodedUrl}&nodeid=${encodedNodeId}`)
        .then(res => res.json())
        .then(refs => {
            if (!Array.isArray(refs)) return;
            updateReferencesTable(refs);
        })
        .catch(err => {
            console.warn(`[${robotRecord.id}] Error loading references:`, err);
        });
}//done
export async function handleSubtreeClick(robotRecord, e) {
    if (!(e.target.tagName === "SUMMARY" || e.target.tagName === "SPAN") || !e.target.dataset.nodeId) {
        return;
    }
    if(!robotRecord) return;
    const { connectivity, opcua, ui } = robotRecord.state;

    const summary = e.target;
    const details = summary.closest("details");
    let ul = details ? details.querySelector("ul") : null;

    if (details && !details.open && !ul.classList.contains("subtree-loaded")) {
        e.preventDefault();

        
        const encodedUrl = encodeURIComponent(connectivity.connectedUrl);
        const nodeId = encodeURIComponent(summary.dataset.nodeId);
        const resp = await fetch(`http://127.0.0.1:8000/subtree_children?url=${encodedUrl}&nodeid=${nodeId}`);
        const html = await resp.text();

        const staging = document.createElement("div");
        staging.innerHTML = html;
        ul.innerHTML = staging.innerHTML;
        ul.classList.add("subtree-loaded");

        details.open = true;

        // update robot's selected node
        ui.selectedNodeId = summary.dataset.nodeId;
        ui.selectedNodeElement = summary;
        showNodeProperties(summary);

        return;
    }
    ui.selectedNodeId = summary.dataset.nodeId;
    ui.selectedNodeElement = summary;
    showNodeProperties(summary);
}