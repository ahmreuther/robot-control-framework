/**
 * Per-robot OPC UA helpers. One shared WebSocket is routed by URL to the right robot.
 * Keeps axis→joint maps, feeds the correct manipulator, and only updates UI for the active robot.
 * Keep new code per robot, not globals.
 */
import { getActiveRobot, listRobots } from "../robot/robotManager.js";
import { isPrismaticType, getJointLimits, getOrderedRevoluteJointNames } from "../robot/joints.js";
import { setInfoBoxState } from "../ui/layout.js";
import { logMessageToBox } from '../ui/logging.js';
import { updateRevoluteJointStatus, updateRobotLockToggleVisibility } from "../ui/robotUiState.js";

/**
 * Normalize OPC UA EngineeringUnits payload into a lowercase identifier string.
 * Accepts legacy string values (e.g. "C81") and structured objects from backend.
 * @param {string|Object|null|undefined} unit - Unit payload from angles message.
 * @returns {string}
 */
function normalizeUnitToken(unit) {
    if (unit === null || unit === undefined) return "";
    if (typeof unit === "string" || typeof unit === "number") {
        return String(unit).trim().toLowerCase();
    }
    if (typeof unit === "object") {
        const display = String(unit.displayName ?? "").trim().toLowerCase();
        const description = String(unit.description ?? "").trim().toLowerCase();
        const unitId = String(unit.unitId ?? "").trim().toLowerCase();
        const namespaceUri = String(unit.namespaceUri ?? "").trim().toLowerCase();
        return [display, description, unitId, namespaceUri].join("|");
    }
    return "";
}

/**
 * Decide whether incoming axis values are radians.
 * Defaults to radians when unit is missing (legacy behavior).
 * @param {string|Object|null|undefined} unit - Unit payload from angles message.
 * @returns {boolean}
 */
function isRadiansUnit(unit) {
    const token = normalizeUnitToken(unit);
    if (!token) return true;

    return token.includes("c81")
        || token.includes("rad")
        || token.includes("radian")
        || token.includes("4408652");
}

/**
 * Map OPC UA axes to URDF joints for this robot; cache the mapping.
 * @param {Object} robotRecord - Robot record with OPC UA state.
 * @param {Object} anglesMsg - Parsed angles message.
 * @returns {Object}
 */
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

/**
 * Build prismatic end-effector map for this robot.
 * @param {Object} robotRecord - Robot record with manipulator.
 * @returns {Object}
 */
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

    // Debug-Log
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
/**
 * Load the device set HTML for this robot only.
 * @param {Object} robotRecord - Robot record to update.
 * @param {string} opcUaUrl - OPC UA URL.
 */
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

/**
 * Track subscription values per robot and only update the active one on screen.
 * @param {string} nodeId - Node id.
 * @param {string|number} value - Subscription value.
 * @param {Object} robotRecord - Robot record to update.
 */
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

/**
 * Remove subscription rows and cache for this robot only.
 * @param {string} nodeId - Node id.
 * @param {Object} robotRecord - Robot record to update.
 */
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

/**
 * Connect this robot to OPC UA via the shared socket.
 * @param {Object} robotRecord - Robot record to connect.
 */
export function connectOpcUa(robotRecord) {
    const infoToggleBtn = document.getElementById("info-toggle-btn");
    infoToggleBtn.style.display = "none";
    
    if (!robotRecord) return console.warn("[Global] No active robot.");
    const urlInput = document.getElementById('opc-ua-url');
    const url = urlInput.value.trim();

    if (!url) {
        alert('Please enter a valid OPC UA Server URL.');
        return;
    }

    const message = `connect|${url}`;

    console.log(`[${robotRecord.id}] Sending:`, message);
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

/**
 * Ask backend to disconnect this robot without affecting others.
 * @param {Object} robotRecord - Robot record to disconnect.
 */
export function disconnectOpcUa(robotRecord) {
    if (!robotRecord) return console.warn("[Global] No active robot.");
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

/**
 * Route incoming socket messages to the robot that owns the URL prefix.
 * Backend messages look like "<opcua-url>|payload"; "Global" prefix is reserved for broadcast notices.
 * @param {MessageEvent} event - WebSocket message event.
 */
export function handleSocketMessage(event) {
    // console.log("Message from server:", event.data);
    const rawData = event.data;
    
    const sepIndex = rawData.indexOf("|");
    if (sepIndex === -1) {
        // Handle unprefixed system-wide notifications
        if (rawData.includes("Disconnected") || rawData === "Global|🔌 Disconnected") {
            console.log("[Global] System Status:", rawData);
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

/**
 * Handle streaming OPC UA data (angles, events, robot info) for one robot.
 * @param {Object} robotRecord - Robot record to update.
 * @param {string} data - Payload string.
 */
function handleProtocolMessage(robotRecord, data) {
    const manipulator = robotRecord.manipulator;
    const { ui, opcua, connectivity, interaction } = robotRecord.state;
    const robotTag = `[${robotRecord.id}]`;

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
            console.warn(`${robotTag} Custom subscription parse error`, e);
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
            console.warn(`${robotTag} Event parse error`, e);
        }
    }
    // robot info
    if (data.startsWith("x|robotinfo:")) {
        try {
            const payload = JSON.parse(data.slice("x|robotinfo:".length));
            console.log(`${robotTag} Robot Info:`, payload);

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
            console.warn(`${robotTag} RobotInfo parse error`, e);
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
                console.warn(`${robotTag} ❌ Parsed value is not a valid angles message:`, anglesMsg);
                return;
            }
        } catch (e) {
            console.warn(`${robotTag} ❌ Error parsing axis data:`, dictStr, e);
            return;
        }
        opcua.lastAngles = anglesMsg.angles;
        opcua.lastAnglesUnit = anglesMsg.unit;

        if (interaction.isManipulating) {

            opcua.lastAngles = anglesMsg.angles;
            return;
        }

        if (!manipulator || !manipulator.robot || !manipulator.robot.joints) {
            console.warn(`${robotTag} ⚠️ URDF Manipulator or Robot Joints not available.`);
            return;
        }

        try {
            buildAxisToJointMap(robotRecord, anglesMsg);
            console.log(`${robotTag} Axis→Joint map:`, buildAxisToJointMap(robotRecord, anglesMsg));
            const valuesAreRadians = isRadiansUnit(anglesMsg.unit);
            const jointValuesRad = {};

            for (const axisName in anglesMsg.angles) {
                const jointName = opcua.axisToJointMap[axisName];
                if (!jointName) continue;

                let value = Number(anglesMsg.angles[axisName]) || 0;
                if (!valuesAreRadians) {
                    // OPC delivers degree → convert to radiant
                    value = value * Math.PI / 180;
                }
                jointValuesRad[jointName] = value;
            }

            const success = manipulator.setJointValues(jointValuesRad);
            if (success) {
                console.log(`${robotTag} ✅ Angle of joints updated:`, jointValuesRad);

                if (robotRecord === getActiveRobot()) {
                    updateRevoluteJointStatus(robotRecord);
                }
            } else {
                console.warn(`${robotTag} ⚠️ manipulator.setJointValues() did not cause any change.`);
            }
        } catch (e) {
            console.warn(`${robotTag} ❌ Could not create axis→joint mapping:`, e);
            return;
        }
    }
}

/**
 * Handle status text for one robot (connect/disconnect, namespace checks, method status).
 * @param {Object} robotRecord - Robot record to update.
 * @param {string} data - Status payload.
 * @param {string} originUrl - OPC UA URL for the message.
 */
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
        opcua.lastAnglesUnit = null;
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

/**
 * Turn sync on/off for one robot; start streams and apply last angles when turning on.
 * @param {Object} robotRecord - Robot record to update.
 * @param {Event} event - Toggle change event.
 */
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

            const valuesAreRadians = isRadiansUnit(opcua.lastAnglesUnit);
            const jointValuesRad = {};
            for (const axisName in lastAngles) {
                const value = Number(lastAngles[axisName]) || 0;
                const rad = valuesAreRadians ? value : (value * Math.PI / 180);

                const jointName = opcua.axisToJointMap[axisName];
                if (jointName) {
                    jointValuesRad[jointName] = rad;
                }
            }
            manipulator.setJointValues(jointValuesRad);
        }
    }
}