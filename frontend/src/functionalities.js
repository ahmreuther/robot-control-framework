import { Vector3 } from "three";
import { getActiveRobot, listRobots } from './robotManager.js';


// Utils: Extract URDF joints from viewer
function normalizeMapLike(mapLike) {
    const out = {};
    if (!mapLike) return out;
    if (typeof mapLike.forEach === 'function') {
        mapLike.forEach((v, k) => out[String(k)] = v);
    } else if (typeof mapLike === 'object') {
        for (const k in mapLike) out[k] = mapLike[k];
    }
    return out;
}

function urdfJointsArray(robotRecord) {
    const manipulator = robotRecord.manipulator;

    const raw = manipulator?.robot?.joints || null;
    const obj = normalizeMapLike(raw);
    const arr = [];
    for (const name in obj) {
        const j = obj[name];
        arr.push({
            name,
            type: String(j.jointType || j._jointType || j.type || '').toLowerCase(),
            parent: j.parent || null,
            child: j.child || null,
            angleRad: Number(Array.isArray(j.jointValue) ? j.jointValue[0] : j.angle) || 0,
            _raw: j
        });
    }
    return arr;
}



function isRevoluteType(t) {
    t = String(t || '').toLowerCase();
    return t === 'revolute' || t === 'continuous';
}

function isPrismaticType(t) {
    t = String(t || '').toLowerCase();
    return t === 'prismatic';
}

function getJointLimits(j) {
    // robustes Auslesen, je nach Parser
    const lim = j?.limit || j?._limit || j?._raw?.limit || {};
    const toNum = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));
    return {
        lower: toNum(lim.lower ?? lim.min),
        upper: toNum(lim.upper ?? lim.max),
        effort: lim.effort !== undefined ? toNum(lim.effort) : undefined,
        velocity: lim.velocity !== undefined ? toNum(lim.velocity) : undefined,
    };
}


// Adjacency: parentLink -> [JointObjects]
function buildAdjacency(jointsArr) {
    const adj = new Map();
    for (const j of jointsArr) {
        if (!j.parentLink || !j.childLink) continue;
        if (!adj.has(j.parentLink)) adj.set(j.parentLink, []);
        adj.get(j.parentLink).push(j);
    }
    return adj;
}


/**
 *Revolute order from base joint (BFS along the chain))
 */
function orderedRevoluteFromBaseJoint(robotRecord, baseJoint) {
    const jointsArr = urdfJointsArray(robotRecord);
    const adj = buildAdjacency(jointsArr);
    const order = [];

    if (!baseJoint) return order;

    if (isRevoluteType(baseJoint.type)) order.push(baseJoint.name);

    const seenLinks = new Set();
    const q = [baseJoint.childLink];
    seenLinks.add(baseJoint.childLink);

    while (q.length) {
        const link = q.shift();
        const edges = adj.get(link) || [];
        edges.sort((a, b) => a.name.localeCompare(b.name));
        for (const e of edges) {
            if (isRevoluteType(e.type)) order.push(e.name);
            if (!seenLinks.has(e.childLink)) {
                seenLinks.add(e.childLink);
                q.push(e.childLink);
            }
        }
    }
    return order;
}


function getOrderedRevoluteJoints(robotRecord) {
    const manipulator = robotRecord.manipulator;

    if (!manipulator || !manipulator.robot || !manipulator.robot.joints) {
        console.warn("⚠️ manipulator.robot.joints missing.");
        return [];
    }


    const allJoints = Object.values(manipulator.robot.joints);

    // Find base = joint whose parent is directly manipulator.robot
    const baseCandidates = allJoints.filter(j => j.parent === manipulator.robot);
    if (baseCandidates.length === 0) {
        console.warn("⚠️ No Base-Joint found.");
        return [];
    }
    const base = baseCandidates[0]; // if there are several -> take the first one


    // Now run along the child chain
    const ordered = [];
    let current = base;

    while (current) {
        if (current.jointType === "revolute" || current.jointType === "continuous") {
            ordered.push(current);
        }
        // continue via child → search for joint there that has this link as parent
        const childLink = current.child;
        if (!childLink) break;
        const next = allJoints.find(j => j.parent === childLink);
        current = next || null;
    }

    return ordered;
}



function getOrderedRevoluteJointNames(robotRecord) {
    const manipulator = robotRecord.manipulator;

    if (!manipulator || !manipulator.robot || !manipulator.robot.joints) {
        console.warn("⚠️ manipulator.robot.joints missing.");
        return [];
    }

    const ordered = [];
    let currentJoint = null;

    // Base-Joint = the first URDFJoint under URDFRobot
    for (const child of manipulator.robot.children) {
        if (child.type === "URDFJoint") {
            currentJoint = child;
            break;
        }
    }

    while (currentJoint) {
        const jointName = currentJoint.name;
        const jointObj = manipulator.robot.joints[jointName];

        if (jointObj && (jointObj.jointType === "revolute" || jointObj.jointType === "continuous")) {
            ordered.push(jointName);
        }

        // Find the next joint: currentJoint.children[0] is URDFLink,
        // and its children contain another URDFJoint
        let nextJoint = null;
        if (currentJoint.children && currentJoint.children.length > 0) {
            const urdfLink = currentJoint.children.find(c => c.type === "URDFLink");
            if (urdfLink && urdfLink.children) {
                nextJoint = urdfLink.children.find(c => c.type === "URDFJoint") || null;
            }
        }

        currentJoint = nextJoint;
    }

    return ordered;
}





function buildAxisToJointMap(robotRecord, anglesMsg) {
    // OPC UA sort Axis
    const axisNames = Object.keys(anglesMsg.angles).sort((a, b) => {
        const ai = parseInt(a.match(/(\d+)$/)?.[1] || "0", 10);
        const bi = parseInt(b.match(/(\d+)$/)?.[1] || "0", 10);
        return ai - bi;
    });

    // Find URDF joints in a chain
    const urdfJointNames = getOrderedRevoluteJointNames(robotRecord);

    // Take the minimum of the two (if the robot has fewer axes than OPC or vice versa)
    const n = Math.min(axisNames.length, urdfJointNames.length);

    const map = {};
    for (let i = 0; i < n; i++) {
        map[axisNames[i]] = urdfJointNames[i];
    }
    const { opcua } = robotRecord.state;
    opcua.axisToJointMap = map;

    //Debug
    console.group("Axis → URDF Mapping");
    axisNames.forEach((axis, i) => {
        console.log(`${axis} → ${map[axis] || "(no URDF Joint)"}`);
    });
    console.groupEnd();

    try {
        buildEndEffectorMap(robotRecord);
    } catch (e) {
        console.warn("⚠️ Endeffektor-Map Fehler:", e);
    }

    return map;
}


function buildEndEffectorMap(robotRecord) {
    const manipulator = robotRecord.manipulator;
    const { opcua } = robotRecord.state;
    if (!manipulator?.robot?.joints) {
        console.warn("⚠️ manipulator.robot.joints missing.");
        opcua.endEffectorMap = { byIndex: {}, byName: {}, byParent: {} };
        return opcua.endEffectorMap;
    }

    const all = Object.values(manipulator.robot.joints);
    const pris = all.filter(j => isPrismaticType(j.jointType))
        .sort((a, b) => a.name.localeCompare(b.name));

    const byIndex = {};
    const byName = {};
    const byParent = {};

    pris.forEach((j, idx) => {
        const lim = getJointLimits(j);
        const mimic = j?.mimic
            ? {
                joint: j.mimic.joint ?? j.mimic?.name ?? undefined,
                multiplier: (j.mimic.multiplier !== undefined ? Number(j.mimic.multiplier) : undefined),
                offset: (j.mimic.offset !== undefined ? Number(j.mimic.offset) : undefined)
            }
            : null;

        const entry = {
            joint: j.name,
            parent: j.parent?.name,
            child: j.child?.name,
            lower: lim.lower,
            upper: lim.upper,
            effort: lim.effort,
            velocity: lim.velocity,
            mimic
        };

        byIndex[`eef${idx + 1}`] = entry;
        byName[j.name] = entry;
        const p = entry.parent || "(unknown)";
        (byParent[p] ||= []).push(entry);
    });

    opcua.endEffectorMap = { byIndex, byName, byParent };

    // Debug-Log im gleichen Stil wie Axis→URDF
    console.group("Endeffektor → Prismatic Mapping");
    Object.keys(byIndex).forEach(k => {
        const e = byIndex[k];
        console.log(`${k} → ${e.joint}`, {
            parent: e.parent, child: e.child,
            lower: e.lower, upper: e.upper,
            effort: e.effort, velocity: e.velocity,
            mimic: e.mimic
        });
    });
    console.groupEnd();

    return opcua.endEffectorMap;
}



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

function updateSubscriptionTable(nodeId, value, robotRecord) {
    // Update State
    if (robotRecord) {
        robotRecord.state.ui.subscriptions.set(nodeId, value);
    }

    // Only update DOM if this is the active robot
    if (robotRecord !== getActiveRobot()) return;

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

        const tbody = table.querySelector("tbody");
        if(tbody) tbody.appendChild(row);
    } else {
        // Value update
        const cellValue = row.querySelector(".subscription-value");
        if (cellValue) cellValue.textContent = value;
    }
}


function removeSubscriptionRow(nodeId, robotRecord) {
    // Update State
    if (robotRecord) {
        robotRecord.state.ui.subscriptions.delete(nodeId);
    }

    // Only update DOM if this is the active robot
    if (robotRecord !== getActiveRobot()) return;

    const table = document.getElementById("subscriptions-table");
    if (!table) return;
    const row = table.querySelector(`tr[data-node-id="${nodeId}"]`);
    if (row) row.remove();
}

export function handleSocketMessage(event) {
    // console.log("Message from server:", event.data);
    const rawData = event.data;
    
    const sepIndex = rawData.indexOf("|");
    if (sepIndex === -1) {
        // Handle unprefixed system-wide notifications
        if (rawData.includes("Disconnected") || rawData === "Global|🔌 Disconnected") {
             console.log("System Status:", rawData);
        }
        return;
    }

    const robotUrl = rawData.substring(0, sepIndex).trim();
    const message = rawData.substring(sepIndex + 1);

    // handle global messages
    if (robotUrl === "Global") {
        logMessageToBox(`Global System Message: ${message}`);
        return;
    }

    const allRobots = listRobots();
    let targetRobot = allRobots.find(r => r.state.connectivity.connectedUrl === robotUrl);
    
    if (!targetRobot) {
        targetRobot = getActiveRobot();
    }
    
    if (message.startsWith("x|")) {
        // This handles angles and events for the SPECIFIC targetRobot found above
        handleProtocolMessage(targetRobot, message);
    } else {
        // This handles text logs and status updates
        handleStatusMessage(targetRobot, message, robotUrl);
    }
}

function handleProtocolMessage(robotRecord, data) {
    const manipulator = robotRecord.manipulator;
    const { ui, opcua, connectivity, interaction } = robotRecord.state;

    // subscriptions
    if (data.startsWith("x|custom:")) {
        try {
            const payload = JSON.parse(data.slice("x|custom:".length));
            if (payload.nodeId && typeof payload.value !== "undefined") {
                updateSubscriptionTable(payload.nodeId, payload.value, robotRecord);

                if (ui.showSubscriptionsTabOnNextCustom && robotRecord === getActiveRobot()) {
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
        // Check whether JSON or plain nodeId:
        const unsubArg = data.replace("x|unsubscribe:", "").trim();
        let nodeId = unsubArg.startsWith("{") ? JSON.parse(unsubArg).nodeId : unsubArg;
        if (nodeId) {
            removeSubscriptionRow(nodeId, robotRecord);
        }
    }

    if (data.startsWith("x|event:")) {
        try {
            const payload = JSON.parse(data.slice("x|event:".length));
            const timestamp = new Date().toLocaleTimeString();
            const eventString = `[${timestamp}] ${JSON.stringify(payload, null, 2)}`;
            
            robotRecord.state.ui.events.unshift(eventString); // newest first

            // Update DOM if active
            if (robotRecord === getActiveRobot()) {
                const eventsContainer = document.getElementById("tab-events");
                if (eventsContainer) {
                    const p = document.createElement("p");
                    p.textContent = eventString;
                    p.style.fontFamily = "monospace";
                    p.style.whiteSpace = "pre-wrap";
                    p.style.borderBottom = "1px solid #ccc";
                    p.style.marginBottom = "5px";

                    // Remove “No events captured” if present
                    const noEvents = eventsContainer.querySelector('.no-events-captured');
                    if (noEvents) noEvents.remove();
                    eventsContainer.prepend(p);
                }
            }
        } catch (e) {
            console.warn("Event parse error", e);
        }
    }
    // robot info
    if (data.startsWith("x|robotinfo:")) {
        try {
            const payload = JSON.parse(data.slice("x|robotinfo:".length));
            console.log("Robot Info:", payload);

            if (payload.manufacturer) {
                robotRecord.state.robotInfo.manufacturer = payload.manufacturer;
            }
            if (payload.model) {
                robotRecord.state.robotInfo.model = payload.model;
            }
            if (payload.gotoMethodNodeId) {
                opcua.gotoMethodNodeId = payload.gotoMethodNodeId;
            }
            if (payload.toggleEndEffMethodNodeId) {
                opcua.toggleEndEffMethodNodeId = payload.toggleEndEffMethodNodeId;
            }

            // update UI if robot is the active one
            if (robotRecord === getActiveRobot()) {
                const manuField = document.getElementById('robot-manufacturer');
                const modelField = document.getElementById('robot-model');
                
                if (manuField && payload.manufacturer) {
                    manuField.textContent = payload.manufacturer;
                }
                if (modelField && payload.model) {
                    modelField.textContent = ' ' + payload.model;
                }
            }
        } catch (e) {
            console.warn("RobotInfo parse error", e);
        }
    }

    if (typeof data === "string" && data.startsWith("x|Mode:")) {
        const modeValue = data.replace("x|Mode:", "").trim();

        robotRecord.state.robotInfo.lastMode = modeValue;

        if (robotRecord === getActiveRobot()) {
            const modeField = document.getElementById('robot-mode-value');
            if (modeField) {
                modeField.textContent = modeValue;
            }
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
            if (success) {
                console.log("✅ Angle of joints updated:", jointValuesRad);

                if (robotRecord === getActiveRobot()) {
                    updateRevoluteJointStatus(robotRecord);
                }
            } else {
                console.warn("⚠️ manipulator.setJointValues() did not cause any change.");
            }
        } catch (e) {
            console.warn("❌ Could not create axis→joint mapping:", e);
            return;
        }
    }
}

function handleStatusMessage(robotRecord, data, originUrl) {
    logMessageToBox(`🔔 ${data}`);
    const { opcua, ui, connectivity } = robotRecord.state;
    // Handle method call result
    if (data.startsWith("Method call result:")) {
        if (robotRecord === getActiveRobot()) {
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
    }

    if (data.startsWith("✅ OPC UA server supports 'Robotics Namespace'")) {
        opcua.hasRoboticsNamespace = true
        updateRobotLockToggleVisibility(robotRecord);
    }

    if (data.startsWith("❌ 'Robotics Namespace' not listed")) {
        opcua.hasRoboticsNamespace = false
        updateRobotLockToggleVisibility(robotRecord);
    }


    if (data.startsWith("✅ Connected to ")) {
        if (!connectivity.connectedUrl) {
            connectivity.connectedUrl = originUrl;
            loadDeviceSet(robotRecord, connectivity.connectedUrl);
        }

        if (robotRecord === getActiveRobot()) {
            setInfoBoxState(true);
            document.getElementById('info-content').style.width = "700px";
            document.getElementById('properties-box').style.display = 'none';           
        }
    } else if (data.startsWith("Model:")) {
        const lines = data.split(/\r?\n/);
        const modelLine = lines.find(line => line.startsWith("Model:"));
        const serialLine = lines.find(line => line.startsWith("Serial Number:"));

        const model = modelLine ? modelLine.replace("Model:", "").trim() : "unknown model";
        const serial = serialLine ? serialLine.replace("Serial Number:", "").trim() : "unknown serial";

        // Update robot stats box only if active
        if (robotRecord === getActiveRobot()) {
            document.getElementById('robot-name-value').textContent = model + " (" + serial + ")";
            document.getElementById('robot-status-value').textContent = 'Connected';
        }

    } else if (data.startsWith("\ud83d\udd0c Disconnected from ")) {
        if (connectivity.connectedUrl === originUrl) {
            connectivity.connectedUrl = null;
        }

        // Cleanup internal state
        opcua.syncEnabled = false;
        opcua.streamActive = false;
        opcua.lastAngles = null;
        opcua.lastEEFPositions = null;
        opcua.axisToJointMap = null;
        opcua.endEffectorMap = null;
        opcua.gotoMethodNodeId = null;
        opcua.toggleEndEffMethodNodeId = null;
        opcua.hasRoboticsNamespace = null;


        if (robotRecord === getActiveRobot()) {
            setInfoBoxState(false);
            document.getElementById('info-content').innerHTML = `
                <h2>OPC UA Address Space</h2>
                <p>Disconnected from Client</p>`;
            document.getElementById('properties-box').style.display = 'none';

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

            // Collapse-Button 
            document.getElementById('info-toggle-btn').style.display = "none";
            updateRobotLockToggleVisibility(robotRecord);
        }

    } else if (data.startsWith("❌ No client found")) {
        if (robotRecord === getActiveRobot()) {
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
}

function setInfoBoxState(expanded) {
    // --- DOM Elements ---
    const infoBox = document.getElementById('info-box');
    const infoToggleBtn = document.getElementById('info-toggle-btn');
    const propertiesBox = document.getElementById('properties-box');

    infoToggleBtn.style.display = "block";
    infoBox.style.width = expanded ? "750px" : "450px";
    propertiesBox.style.width = expanded ? "750px" : "450px";
    infoToggleBtn.textContent = expanded ? "collapse »" : "« expand";
}

// Toggle OPC UA panel (works)
export function toggleOpcUaSection() {

    const toggleOpcUa = document.getElementById('toggle-opc-ua');
    const opcUaSection = document.getElementById('opc-ua');

    toggleOpcUa.addEventListener('click', () => {
        opcUaSection.classList.toggle('hidden');
    });
}


// Toggle Robot Dashboard panel (works)
export function toggleRobotDashboardSection() {
    const toggleRobotDashboard = document.getElementById('toggle-robot-dashboard');
    const robotDashboardSection = document.getElementById('robot-dashboard');

    toggleRobotDashboard.addEventListener('click', () => {
            robotDashboardSection.classList.toggle('hidden');
    });
}


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
        //connectivity.connectedUrl = url;
        console.log(`[${robotRecord.id}] Connecting to OPC UA at ${url}`);

    } else {
        alert("WebSocket is not connected.");
    }
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
        document.getElementById('info-content').style.width = "400px";

        console.log(`[${robotRecord.id}] Requesting disconnect from OPC UA at ${url}`);
    } else {
        alert("WebSocket is not connected.");
    }
}

function showNodeProperties(element, robotRecord) {
    // If no robotRecord provided, try to find active (backwards compat)
    if (!robotRecord) robotRecord = getActiveRobot();
    
    // Save state
    const dataset = element.dataset;
    if (robotRecord) {
        robotRecord.state.ui.properties = { ...dataset };
    }

    // Only update DOM if active
    if (robotRecord !== getActiveRobot()) return;

    const propertiesBox = document.getElementById("properties-box");
    const table = document.getElementById("properties-table");

    table.innerHTML = "";

    for (const key in dataset) {
        const row = document.createElement("tr");
        const keyCell = document.createElement("td");
        const valueCell = document.createElement("td");

        keyCell.textContent = key.replace(/([A-Z])/g, ' $1').toUpperCase();

        if (key.toLowerCase() === "value") {
            valueCell.innerHTML = dataset[key];
        } else {
            valueCell.textContent = dataset[key];
        }

        row.appendChild(keyCell);
        row.appendChild(valueCell);
        table.appendChild(row);
    }

    propertiesBox.style.display = "block";
}


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
    if (!opcua.hasRoboticsNamespace) {
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
    }
}
function updateReferencesTable(refs, robotRecord) {
    // Update State
    if (robotRecord) {
        robotRecord.state.ui.references = refs;
    }

    // Only update DOM if active
    if (robotRecord !== getActiveRobot()) return;

    const referencesTable = document.getElementById("references-table");
    if (!referencesTable) return;
    const oldTbody = referencesTable.querySelector("tbody");
    const newTbody = document.createElement("tbody");

    // Use the refs passed in (which are fresh) or fallback to stored refs if needed,
    // though 'refs' here is the source of truth for this update.
    refs.forEach(refObj => {
        const row = document.createElement("tr");

        const makeCell = (value) => {
            const td = document.createElement("td");
            td.textContent = value || "";
            return td;
        };

        row.appendChild(makeCell(refObj.ReferenceType));
        row.appendChild(makeCell(refObj.NodeId));
        row.appendChild(makeCell(refObj.BrowseName));
        row.appendChild(makeCell(refObj.TypeDefinition));

        newTbody.appendChild(row);
    });

    if (oldTbody) {
        referencesTable.replaceChild(newTbody, oldTbody);
    } else {
        referencesTable.appendChild(newTbody);
    }
}
//done
export function handleOpcUaNodeSelection(robotRecord, event) {
    

    if (event.target.closest('#custom-context-menu')) return;

    if (!((event.target.tagName === "SUMMARY" || event.target.tagName === "SPAN") && event.target.dataset?.nodeId)) return;
    
    if (!robotRecord) {
        logMessageToBox('❌ No active robot.');
        return false;
    }

    const { connectivity, ui } = robotRecord.state;

    ui.selectedNodeId = event.target.dataset.nodeId;
    ui.selectedNodeElement = event.target;

    console.log("Selected Node ID:", ui.selectedNodeId);
    showNodeProperties(event.target, robotRecord);

    if (!connectivity.connectedUrl) return;

    const encodedUrl = encodeURIComponent(connectivity.connectedUrl);
    const encodedNodeId = encodeURIComponent(ui.selectedNodeId);

    fetch(`http://127.0.0.1:8000/references?url=${encodedUrl}&nodeid=${encodedNodeId}`)
        .then(res => res.json())
        .then(refs => {
            if (!Array.isArray(refs)) return;
            updateReferencesTable(refs, robotRecord);
        })
        .catch(err => {
            console.warn(`[${robotRecord.id}] Error loading references:`, err);
        });
}
//done

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
        showNodeProperties(summary, robotRecord);

        return;
    }
    ui.selectedNodeId = summary.dataset.nodeId;
    ui.selectedNodeElement = summary;
    showNodeProperties(summary, robotRecord);
}
export function switchTab(tabName) { //Done i think maybe TODO because different
    const buttons = document.querySelectorAll(".tab-btn");
    buttons.forEach((btn) => {
        if (btn.getAttribute("data-tab") === tabName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    const contents = document.querySelectorAll(".tab-content");
    contents.forEach((content) => {
        if (content.id === `tab-${tabName}`) {
            content.classList.add("active");
        } else {
            content.classList.remove("active");
        }
    });
    console.log(`Switched UI to ${tabName} tab.`);
}

export function logMessageToBox(msg) {
    const logContainer = document.getElementById('message-log');
    const line = document.createElement('div');
    line.classList.add('log-entry');
    line.textContent = msg;
    logContainer.prepend(line);
}
//done
export function clearLog() {
    document.getElementById('message-log').innerHTML ='';
}
//done
export function handleContextMenu(robotRecord, e) {
    if(!robotRecord) return;
  const target = e.target;
  const { ui } = robotRecord.state;

  if ((target.matches("summary, span")) && target.dataset.nodeId) {
        e.preventDefault();
        ui.selectedNodeId = target.dataset.nodeId;
        ui.selectedNodeElement = target;
        const menu = document.getElementById("custom-context-menu");
        menu.style.top = e.pageY + "px";
        menu.style.left = e.pageX + "px";
        menu.style.display = "block";
    } else {
        document.getElementById("custom-context-menu").style.display = "none";
        ui.selectedNodeId = null;
        ui.selectedNodeElement = null;
    }
}
export function handleNodeClick(robotRecord, e) {
    if(!robotRecord) return;
    const { ui } = robotRecord.state;
  if ((e.target.tagName === "SUMMARY" || e.target.tagName === "SPAN") && e.target.dataset.nodeId) {
        ui.selectedNodeId = e.target.dataset.nodeId;
        ui.selectedNodeElement = e.target;

        const nodeClass = ui.selectedNodeElement.dataset.nodeclass;

        if (nodeClass == "2") {
            if (e.target.tagName === "SPAN") {
                refreshSelectedNode();
            }
        }

        showNodeProperties(e.target, robotRecord);
    }
}
//done
export function handleContextCallMethod(robotRecord) {
    if(!robotRecord) return;
    const menu = document.getElementById("custom-context-menu");
    menu.style.display = "none";

    const { ui, connectivity}  = robotRecord.state;
    if (!ui.selectedNodeId || !ui.selectedNodeElement){
        alert('❌ No node selected. (nodeId missing)');
        return;
    } 

    const nodeClass = ui.selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "4") {
        alert("❌ This node is not a method (NodeClass ≠ 4).");
        return;
    }

    // Suche nach InputArguments in den Kind-Elementen
    const inputNode = Array.from(
        ui.selectedNodeElement.parentElement.querySelectorAll("summary, span")
    ).find(el => el.dataset.name && el.dataset.name.endsWith('InputArguments'));


    const methodStatus = document.getElementById('method-call-status');
    const spinner = document.getElementById('method-spinner');
    const statusText = document.getElementById('method-status-text');

    if (inputNode) {
        const rawValue = inputNode.getAttribute('data-value');
        const nodeIdForCall = ui.selectedNodeId;
        showInputParameterPopup(rawValue, (userInputs) => {
            const payload = {
                nodeId: nodeIdForCall,
                inputs: userInputs,
                url: connectivity.connectedUrl,
            };
            methodStatus.style.display = 'flex';
            spinner.style.display = 'inline-block';
            statusText.textContent = `Method is being executed...`;
            connectivity.socket.send(`call|${JSON.stringify(payload)}`);
        });
    } else {
        methodStatus.style.display = 'flex';
        spinner.style.display = 'inline-block';
        statusText.textContent = `Method is being executed...`;
        const payload = {
            nodeId: ui.selectedNodeId,
            inputs: "",
            url: connectivity.connectedUrl,
        };
        connectivity.socket.send(`call|${JSON.stringify(payload)}`);
    }
}
//done
export function handleContextSubscribe(robotRecord) {
    if(!robotRecord) return;
    document.getElementById("custom-context-menu").style.display = "none";

    const { ui, connectivity } = robotRecord.state;

    if (!ui.selectedNodeId || !ui.selectedNodeElement) {
        alert('❌ No node selected. (nodeId missing)');
        return;
    }

    const nodeClass = ui.selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "2") {
        alert("❌ This node is not a variable (NodeClass ≠ 2).");
        return;
    }
    if (ui.selectedNodeId && connectivity.connectedUrl) {
        const payload = {
            url: connectivity.connectedUrl,
            nodeId: ui.selectedNodeId
        };
        connectivity.socket.send("subscribe|" + JSON.stringify(payload));
        ui.showSubscriptionsTabOnNextCustom = true;
    }
}//done
export function handleContextUnsubscribe(robotRecord) {
    if(!robotRecord) return;
    document.getElementById("custom-context-menu").style.display = "none";
    const { ui, connectivity } = robotRecord.state;
    if (!ui.selectedNodeId || !ui.selectedNodeElement) {
        alert('❌ No node selected. (nodeId missing)');
        return;
    }

    const nodeClass = ui.selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "2") {
        alert("❌ This node is not a variable (NodeClass ≠ 2).");
        return;
    }
    if (ui.selectedNodeId && connectivity.connectedUrl) {
        const payload = {
            url: connectivity.connectedUrl,
            nodeId: ui.selectedNodeId
        };
        connectivity.socket.send("unsubscribe|" + JSON.stringify(payload));
    }
}//done
export function handleContextSubscribeEvent(robotRecord) {
    if(!robotRecord) return;
    document.getElementById("custom-context-menu").style.display = "none";
    const { ui, connectivity } = robotRecord.state;
    if (!ui.selectedNodeId || !ui.selectedNodeElement) {
        alert('❌ No node selected. (nodeId missing)');
        return;
    }

    const nodeClass = ui.selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "1") {
        alert("❌ This node is not an object (NodeClass ≠ 1).");
        return;
    }
    if (ui.selectedNodeId && connectivity.connectedUrl) {
        const payload = {
            url: connectivity.connectedUrl,
            nodeId: ui.selectedNodeId
        };
        connectivity.socket.send("subscribeEvent|" + JSON.stringify(payload));
        ui.showSubscriptionsTabOnNextCustom = true;
    }
} // done
export function handleContextUnsubscribeEvent(robotRecord) {
    if(!robotRecord) return;
    document.getElementById("custom-context-menu").style.display = "none";
    const { ui, connectivity } = robotRecord.state;
    if (!ui.selectedNodeId || !ui.selectedNodeElement) {
        alert('❌ No node selected. (nodeId missing)');
        return;
    }

    const nodeClass = ui.selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "1") {
        alert("❌ This node is not an object (NodeClass ≠ 1).");
        return;
    }
    if (ui.selectedNodeId && connectivity.connectedUrl) {
        const payload = {
            url: connectivity.connectedUrl,
            nodeId: ui.selectedNodeId
        };
        connectivity.socket.send("unsubscribeEvent|" + JSON.stringify(payload));
    }
}
function showInputParameterPopup(rawHtml, callback) {
    let htmlToParse = rawHtml.trim();
    if (!/^<ul[\s>]/i.test(htmlToParse)) {
        htmlToParse = `<ul>${htmlToParse}</ul>`;
    }
    const container = document.createElement('div');
    container.innerHTML = htmlToParse;
    const items = container.querySelectorAll('li.arg-item');

    // Overlay
    const overlay = document.createElement('div');
    overlay.classList.add('ds-overlay');

    // Modal
    const modal = document.createElement('div');
    modal.classList.add('ds-modal');

    const header = document.createElement('h4');
    header.textContent = 'Methoden-Parameter eingeben';
    header.classList.add('ds-modal-title');
    modal.appendChild(header);

    const form = document.createElement('form');
    form.classList.add('ds-form');

    items.forEach(item => {
        const name = item.querySelector('.arg-name').textContent;
        const desc = item.querySelector('.arg-description').textContent.replace(' – ', '');
        const meta = item.querySelector('.arg-meta').textContent.match(/Type:\s*([^,]+)/)[1];

        const fieldWrapper = document.createElement('div');
        fieldWrapper.classList.add('ds-form-group');

        const label = document.createElement('label');
        label.classList.add('ds-label');
        label.innerHTML = `<span class="ds-param-name">${name}</span> 
                           <span class="ds-param-desc">(${desc})</span> 
                           <span class="ds-param-type">[${meta}]</span>`;
        fieldWrapper.appendChild(label);

        const input = document.createElement('input');
        input.name = name;
        input.type = 'text';
        input.classList.add('ds-input');
        fieldWrapper.appendChild(input);

        form.appendChild(fieldWrapper);
    });

    const btnWrap = document.createElement('div');
    btnWrap.classList.add('ds-form-actions');

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = 'Aufrufen';
    submitBtn.classList.add('ds-btn', 'ds-btn-primary');
    btnWrap.appendChild(submitBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Abbrechen';
    cancelBtn.classList.add('ds-btn', 'ds-btn-secondary');
    cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));
    btnWrap.appendChild(cancelBtn);

    form.appendChild(btnWrap);
    modal.appendChild(form);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    form.addEventListener('submit', e => {
        e.preventDefault();
        const data = {};
        new FormData(form).forEach((value, key) => data[key] = value);
        document.body.removeChild(overlay);
        callback(data);
    });
}
export function handleGlobalMouseDown(e) {
    const menu = document.getElementById('custom-context-menu');
    if (menu.style.display === 'block' && !menu.contains(e.target)) {
        menu.style.display = 'none';
    }
}

/**
 * Forces the target element to match the source element's width
 */
export const syncWidth = (source, target) => {
    if (source && target) {
        target.style.width = source.style.width;
    }
};

/**
 * Creates an observer that ensures target width follows source width
 */
export const initWidthObserver = (source, target) => {
    const observer = new MutationObserver(() => syncWidth(source, target));
    observer.observe(source, { attributes: true, attributeFilter: ['style'] });
    return observer;
};

/**
 * Creates an observer that prevents the 'checked' class from being applied.
 * Starts the observer immediately after calling the method
 */
export const initAnimationBlocker = (element) => {
    if (!element) return null;
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.classList.contains('checked')) {
                mutation.target.classList.remove('checked');
            }
        });
    });
    observer.observe(element, { attributes: true, attributeFilter: ['class'] });
    return observer;
};

/**
 * Pure logic to determine the next UI state based on current expansion
 */
export const getToggleDimensions = (isCurrentlyExpanded) => {
    return {
        width: isCurrentlyExpanded ? "450px" : "750px",
        label: isCurrentlyExpanded ? "« expand" : "collapse »",
    };
};

// Merker für letzte EEF-Positionen
function getVal(j) {
    return Array.isArray(j.jointValue) ? Number(j.jointValue[0]) : Number(j.angle || 0);
}
function getLimits(j) {
    const lim = j?.limit || j?._limit || j?._raw?.limit || {};
    const toNum = v => (v === undefined || v === null || v === '' ? NaN : Number(v));
    return { lower: toNum(lim.lower ?? lim.min), upper: toNum(lim.upper ?? lim.max) };
}
//helper method that get a robotRecord.manipulator.robot
function getEEFMasters(robot) {
    if (window.endEffectorMap?.byName) {
        return Object.keys(endEffectorMap.byName)
            .map(n => robot.joints[n])
            .filter(j => j && j.jointType === 'prismatic' && !j.mimic);
    }
    return Object.values(robot.joints).filter(j => j.jointType === 'prismatic' && !j.mimic);
}
function getFormattedJointString(robotRecord) {
    const manipulator = robotRecord.manipulator;
    const r = manipulator.robot;
    const radiansToggle = document.getElementById('radians-toggle');
    const useRadians = radiansToggle && radiansToggle.classList.contains('checked');

    if (!r || !r.joints) return;

    const jointValues = [];
    let idx = 1;

    for (const name in r.joints) {
        const joint = r.joints[name];
        if (joint.jointType === 'revolute') {
            let value = Array.isArray(joint.jointValue) ? joint.jointValue[0] : joint.angle;
            if (!useRadians) value *= 180 / Math.PI;
            let num = parseFloat(value);
            let formatted;
            if (!useRadians) {
                formatted = num.toFixed(1);
            } else {
                if (Math.abs(num) < 1) {
                    formatted = num.toPrecision(2);
                } else {
                    formatted = num.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9]*)0+$/, '$1');
                }
            }
            jointValues.push(`j${idx}:${formatted}${useRadians ? 'rad' : '°'}`);
            idx++;
        }
    }
    return jointValues;
}

export function updateRevoluteJointStatus(robotRecord) {
    
    // Only update UI if active
    if (robotRecord !== getActiveRobot()) return;

    const jointValues = getFormattedJointString(robotRecord);
    const statusField = document.getElementById('robot-position-value');
    const manipulator = robotRecord?.manipulator || null;
    
    if (statusField) {
        statusField.textContent = jointValues.join(', ');
    }
    const TCPField = document.getElementById('robot-tcp-value');

    if (TCPField) {
        if (manipulator && manipulator.targetObject) {
        TCPField.textContent = 'Pos: ' + manipulator.targetObject.position.toArray().map(coord => coord.toFixed(3)).join(', ') + ' ;Rot: ' + manipulator.targetObject.quaternion.toArray().map(coord => coord.toFixed(3)).join(', ');
        } else {
            TCPField.textContent = 'Pos: (n/a) ;Rot: (n/a)';
        }
    }
}
export function handleManipulateEnd(robotRecord) {
    const { connectivity } = robotRecord.state;
    if (!connectivity.socket || 
        connectivity.socket.readyState !== WebSocket.OPEN || 
        !connectivity.connectedUrl) {
        return; 
    }

    const manipulator = robotRecord.manipulator;
    const { opcua, interaction } = robotRecord.state;
    interaction.isManipulating = false;

    const syncToggle = document.getElementById('opc-ua-sync-toggle');
    if (!syncToggle?.checked) return;

    const r = manipulator.robot;
    if (!r?.joints) return;

    const eefMasters = getEEFMasters(r);
    let eefTriggered = false;

    // --- Endeffektor prüfen ---
    for (const j of eefMasters) {
        const cur = getVal(j);
        const last = opcua.lastEEFPositions?.[j.name];
        const changed = (last !== undefined) && (cur !== last);

        if (changed) {
            const { lower, upper } = getLimits(j);
            const atLower = (cur === lower);
            const atUpper = (cur === upper);

            if (atLower || atUpper) {
                const nodeId = opcua.toggleEndEffMethodNodeId;
                if (!nodeId) {
                    logMessageToBox('⚠️ “toggleEndEff” method not yet known. Please connect or try again.');
                    break;
                }

                const payload = { nodeId, url: connectivity.connectedUrl };
                console.log("Send End Effector after limit reached:", payload);

                if (connectivity.socket && connectivity.socket.readyState === WebSocket.OPEN) {
                    connectivity.socket.send(`call|${JSON.stringify(payload)}`);
                    eefTriggered = true;
                }
                break; // nur ein EEF-Call
            }
        }
    }

    // letzte EEF-Positionen merken
    eefMasters.forEach(j => { 
        if (!opcua.lastEEFPositions) {
            opcua.lastEEFPositions = {};
        }
        opcua.lastEEFPositions[j.name] = getVal(j);
    });

    if (eefTriggered) return; // nur Endeffektor gesendet → fertig

    // --- Revolute prüfen: nur senden, wenn sich was geändert hat ---
    const jointValuesRad = [];
    let revoluteChanged = false;

    for (const name in r.joints) {
        const joint = r.joints[name];
        if (joint.jointType === 'revolute') {
            const value = Array.isArray(joint.jointValue) ? joint.jointValue[0] : joint.angle;
            jointValuesRad.push(parseFloat(value.toFixed(6)));

            // prüfen ob sich gegenüber letztem Stand geändert hat
            const lastEEFPositions = opcua.lastEEFPositions?.[name];
            if (lastEEFPositions === undefined || lastEEFPositions !== value) {
                revoluteChanged = true;
            }
        }
    }

    if (!revoluteChanged) return; // nix Neues → kein GoTo

    const jointsString = JSON.stringify(jointValuesRad);
    const nodeId = opcua.gotoMethodNodeId;

    if (!nodeId) {
        logMessageToBox('⚠️ “Go To” method not yet known. Please connect or try again.');
        return;
    }

    const payload = {
        nodeId,
        inputs: {
            mode: 'automatic',
            joints: jointsString,
            "max-Speed": '',
            time: '',
            tcp_config: '',
            avoidance_zones: ''
        },
        url: connectivity.connectedUrl
    };

    console.log("Send Go To after drag end:", payload);
    if (connectivity.socket && connectivity.socket.readyState === WebSocket.OPEN) {
        connectivity.socket.send(`call|${JSON.stringify(payload)}`);
    }
}

export function refreshSelectedNode(robotRecord) {
    if(!robotRecord) return;
    const { ui, connectivity } = robotRecord.state;
    if (!ui.selectedNodeId || !connectivity.connectedUrl) return;

    let el = document.querySelector(`[data-node-id="${ui.selectedNodeId}"]`);
    if (!el) return;

    const nodeClass = el.dataset.nodeclass;
    const li = el.closest('li');
    if (!li) return;

    if (nodeClass == "2") {
        const hasChildren = li.querySelector('ul') && li.querySelector('ul').children.length > 0;
        if (hasChildren) {

            return;
        }
        const encodedUrl = encodeURIComponent(connectivity.connectedUrl);
        const encodedNodeId = encodeURIComponent(ui.selectedNodeId);
        fetch(`http://127.0.0.1:8000/node_rendered?url=${encodedUrl}&nodeid=${encodedNodeId}&children_depth=1`)
            .then(res => res.text())
            .then(html => {
                const staging = document.createElement('div');
                staging.innerHTML = html;
                li.replaceWith(...staging.childNodes);

                const newNode = document.querySelector(`[data-node-id="${ui.selectedNodeId}"]`);
                if (newNode) {
                    ui.selectedNodeElement = newNode;
                    showNodeProperties(newNode);
                }
            });
        return;
    }

    showNodeProperties(el, robotRecord);
}

function updateRobotLockToggleVisibility(robotRecord) {
    const container = document.getElementById('robot-lock-toggle-container');
    if (!container) return;
    
    // Always hide if no robot is active or provided
    if (!robotRecord) {
        container.style.display = 'none';
        return;
    }

    // Only update UI if this robot is actually the active one
    if (robotRecord !== getActiveRobot()) return;

    const hasRoboticsNamespace = robotRecord.state.opcua.hasRoboticsNamespace === true;
    container.style.display = hasRoboticsNamespace ? '' : 'none';
}

export function handleHomeClick(robotRecord) {
    const manipulator = robotRecord.manipulator;
    if (manipulator) {
        manipulator.dispatchEvent(new Event('reset-angles'));
    }
}

//connect and setup method if mcp socket doesn't exist. called in 
function setup_mcp_socket(robotRecord) {
    if (!robotRecord) return;
    const { connectivity } = robotRecord.state;
    if (connectivity.socketMcp) {
        console.warn("MCP socket already open for this robot.");
        return;
    }

    connectivity.socketMcp = new WebSocket("ws://127.0.0.1:8000/ws_mcp");
    connectivity.status = 'connecting';

    connectivity.socketMcp.onopen = () => {
        console.log("MCP WebSocket connection established.");
        connectivity.status = 'connected';
        connectivity.socketMcp.send("status");
    };

    connectivity.socketMcp.onmessage = (event) => {
        const data = event.data;
        console.log("MCP Message from server:", data);

        const manipulator = robotRecord.manipulator;
        if (!manipulator) return;
        let r = manipulator.robot;

        if (event.data.startsWith("TCP_POS|")) {
            let tcp_coords = event.data.replace("TCP_POS|", "").split(",");
            let position = new Vector3(
                parseFloat(tcp_coords[0]),
                parseFloat(tcp_coords[1]),
                parseFloat(tcp_coords[2])
            )
            manipulator.targetObject.position.set(...position);
            // console.log('Target pos2:', manipulator.targetObject.position);
            manipulator.solve();
            manipulator.dispatchEvent(new Event('manipulate-end'));
            manipulator.dispatchEvent(new Event('change'));

        } else if (event.data.startsWith("JOINTS|")) {
            let joint_raw_data = event.data.replace("JOINTS|", "").replace("°", "").split(", ");

            const jointValuesRad = {};
            let idx = 0;

            for (const name in r.joints) {
                const joint = r.joints[name];
                if (joint.jointType === 'revolute') {
                    jointValuesRad[name] = joint_raw_data[idx] / 180 * Math.PI;
                    idx++;
                }
            }

            manipulator.setJointValues(jointValuesRad);
        } /*else if (event.data.startsWith("JOINT|")) {
            let joint_raw_data = event.data.replace("JOINT|", "").split("|");
            let joint_index = joint_raw_data[0];
            let joint_angle = joint_raw_data[1];
        } else if (event.data.startsWith("OPCUA-NODE|")) {

        }*/ // code is useless right? delete?
    };

    connectivity.socketMcp.onerror = (error) => {
        console.error("MCP WebSocket error:", error);
        connectivity.status = 'error';
    };

    connectivity.socketMcp.onclose = () => {
        console.log("MCP WebSocket connection closed.");
        connectivity.status = 'disconnected';
        connectivity.socketMcp = null;
    };
}

function disconnect_mcp_socket(robotRecord) {
    if (!robotRecord) return;

    const robotId = robotRecord.id;
    const { connectivity } = robotRecord.state

    if (connectivity.socketMcp) {
        connectivity.socketMcp.close();
        connectivity.socketMcp = null;
        connectivity.status = 'disconnected';
        console.log(`[${robotId}] MCP WebSocket disconnected successfully.`);
    }
}

export function toggleMcpIntegration(robotRecord, event) {
    if (!robotRecord) return;
    if (event.target.checked) {
        setup_mcp_socket(robotRecord);
        robotRecord.opcua.syncEnabled = true;
    } else {
        disconnect_mcp_socket(robotRecord);
        robotRecord.opcua.syncEnabled = false;
    }
}

export function sendMcpRobotStateUpdate(robotRecord) {
    const manipulator = robotRecord.manipulator;
    const { connectivity } = robotRecord.state;

    // Check if the specific socket for this robot is open
    if (!connectivity.socketMcp || connectivity.socketMcp.readyState !== WebSocket.OPEN) return;
    if (!manipulator || !manipulator.robot) return;

    connectivity.socketMcp.send('TCP|' + 'Pos: ' + manipulator.targetObject.position.toArray().map(coord => coord.toFixed(3)).join(', ') + ' ;Rot: ' + manipulator.targetObject.quaternion.toArray().map(coord => coord.toFixed(3)).join(', '));
    const jointValues = getFormattedJointString(robotRecord);
    connectivity.socketMcp.send('ANGLES|' + jointValues.join(', '));
}

export function updateRobotSpecificUI(robotRecord) {
    // clear tables first
    const subsTable = document.getElementById('subscriptions-table');
    if (subsTable) {
        const tbody = subsTable.querySelector('tbody');
        if (tbody) tbody.innerHTML = '';
    }

    const eventsContainer = document.getElementById('tab-events');
    if (eventsContainer) {
        eventsContainer.innerHTML = '<p class="no-events-captured" style="color:#888; font-style:italic;">No events captured.</p>';
    }

    const referencesTable = document.getElementById("references-table");
    if (referencesTable) {
        const tbody = referencesTable.querySelector("tbody");
        if (tbody) tbody.innerHTML = '';
    }

    const propertiesBox = document.getElementById("properties-box");
    const propertiesTable = document.getElementById("properties-table");
    if (propertiesTable) propertiesTable.innerHTML = "";
    if (propertiesBox) propertiesBox.style.display = "none";

    const infoContent = document.getElementById('info-content');
    if (infoContent) {
        infoContent.innerHTML = `<h2>OPC UA Address Space</h2><p>Select a robot to view details.</p>`;
    }

    // global UI reset
    setInfoBoxState(false);
    document.getElementById('robot-name-value').textContent = '-';
    document.getElementById('robot-status-value').textContent = 'No Robot Selected';
    document.getElementById('robot-mode-value').textContent = '-';
    document.getElementById('robot-manufacturer').textContent = '-';
    document.getElementById('robot-model').textContent = '';
    
    const urlInput = document.getElementById('opc-ua-url');
    if (urlInput) urlInput.value = "";
    
    const syncToggle = document.getElementById('opc-ua-sync-toggle');
    if (syncToggle) syncToggle.checked = false;

    // if no robot is selected, stop here
    if (!robotRecord) return;

    const { ui, connectivity, opcua, robotInfo } = robotRecord.state;
    
    // restore subscriptions
    if (subsTable && ui.subscriptions) {
        const tbody = subsTable.querySelector('tbody');
        ui.subscriptions.forEach((val, nodeId) => {
            const row = document.createElement("tr");
            row.setAttribute("data-node-id", nodeId);
            const cellNodeId = document.createElement("td");
            cellNodeId.textContent = nodeId;
            const cellValue = document.createElement("td");
            cellValue.className = "subscription-value";
            cellValue.textContent = val;
            row.appendChild(cellNodeId);
            row.appendChild(cellValue);
            tbody.appendChild(row);
        });
    }

    // restore events
    if (eventsContainer && ui.events && ui.events.length > 0) {
        eventsContainer.innerHTML = '';
        ui.events.forEach(eventString => {
            const p = document.createElement("p");
            p.textContent = eventString;
            p.style.fontFamily = "monospace";
            p.style.whiteSpace = "pre-wrap";
            p.style.borderBottom = "1px solid #ccc";
            p.style.marginBottom = "5px";
            eventsContainer.appendChild(p);
        });
    }

    // restore references
    if (referencesTable && ui.references && ui.references.length > 0) {
        const tbody = referencesTable.querySelector("tbody");
        ui.references.forEach(refObj => {
            const row = document.createElement("tr");
            const makeCell = (value) => {
                const td = document.createElement("td");
                td.textContent = value || "";
                return td;
            };
            row.appendChild(makeCell(refObj.ReferenceType));
            row.appendChild(makeCell(refObj.NodeId));
            row.appendChild(makeCell(refObj.BrowseName));
            row.appendChild(makeCell(refObj.TypeDefinition));
            tbody.appendChild(row);
        });
    }

    // restore properties
    if (ui.properties && Object.keys(ui.properties).length > 0) {
        for (const key in ui.properties) {
            const row = document.createElement("tr");
            const keyCell = document.createElement("td");
            const valueCell = document.createElement("td");
            keyCell.textContent = key.replace(/([A-Z])/g, ' $1').toUpperCase();
            const val = ui.properties[key];
            if (key.toLowerCase() === "value") valueCell.innerHTML = val;
            else valueCell.textContent = val;
            row.appendChild(keyCell);
            row.appendChild(valueCell);
            propertiesTable.appendChild(row);
        }
        if (propertiesBox) propertiesBox.style.display = "block";
    }

    // restore address space tree
    if (ui.addressSpaceHTML) {
        infoContent.innerHTML = ui.addressSpaceHTML;
        setInfoBoxState(!!connectivity.connectedUrl);
    } else if (connectivity.connectedUrl) {
         infoContent.innerHTML = `<h2>OPC UA Address Space</h2><p>Connected to ${connectivity.connectedUrl}</p>`;
         setInfoBoxState(true);
    } else {
         infoContent.innerHTML = `<h2>OPC UA Address Space</h2><p>Not connected.</p>`;
         setInfoBoxState(false);
    }

    // restore dashboard stats
    document.getElementById('robot-name-value').textContent = 
        robotInfo.model ? `${robotInfo.model} (${robotInfo.serialNumber || ''})` : 'Unknown Model';
    document.getElementById('robot-status-value').textContent = 
        connectivity.connectedUrl ? 'Connected' : 'Not Connected';

    // restore robot manufacturer, model and mode
    const manuField = document.getElementById('robot-manufacturer');
    const modelField = document.getElementById('robot-model');
    const modeField = document.getElementById('robot-mode-value');
    
    if (manuField) manuField.textContent = robotInfo.manufacturer || '-';
    if (modelField) modelField.textContent = ' ' + (robotInfo.model || '');
    if (modeField) modeField.textContent = robotInfo.lastMode || '-';

    // sync the URL input and control fields
    if (urlInput) urlInput.value = connectivity.connectedUrl || "";
    
    if (syncToggle) {
        syncToggle.checked = !!opcua.syncEnabled;
    }
    // not sure if we even need this
    /*if (infoToggleBtn) {
        infoToggleBtn.style.display = connectivity.connectedUrl ? "block" : "none";
    }*/

    // update Joint/TCP values immediately
    updateRevoluteJointStatus(robotRecord);

    // handle feature visibility
    updateRobotLockToggleVisibility(robotRecord);
}