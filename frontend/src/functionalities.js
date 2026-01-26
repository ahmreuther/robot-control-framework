import { Vector3 } from "three";

let socket;
let socket_mcp;
let viewer = null;
let opcUaSyncEnabled;
let isMouseDownOnJoint = false;
let connectedUrl;
let opcUaStreamActive = false;
let lastOpcUaAngles = null;
let isManipulating = false;
let selectedNodeId = null;
let selectedNodeElement = null;
let showSubscriptionsTabOnNextCustom = false;
let hasRoboticsNamespace = null
let gotoMethodNodeId = null;
let toggleEndEffMethodNodeId = null;


let host = `http://${window.location.host}`;
if (process.env.NODE_ENV !== "production") {
  host = "http://127.0.0.1:8000"
}
// console.log(host);

function get_ws_url(subpath) {
    var url = new URL(subpath, host);
    
    url.protocol = url.protocol.replace('http', 'ws');

    // console.log(url.href);

    return url.href; // => ws://www.example.com:9999/path/to/websocket
}



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

function urdfJointsArray() {
    const raw = viewer?.robot?.joints || null;
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
function orderedRevoluteFromBaseJoint(baseJoint) {
    const jointsArr = urdfJointsArray();
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


function getOrderedRevoluteJoints() {
    if (!viewer || !viewer.robot || !viewer.robot.joints) {
        console.warn("⚠️ viewer.robot.joints missing.");
        return [];
    }


    const allJoints = Object.values(viewer.robot.joints);

    // Find base = joint whose parent is directly viewer.robot
    const baseCandidates = allJoints.filter(j => j.parent === viewer.robot);
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



function getOrderedRevoluteJointNames() {
    if (!viewer || !viewer.robot || !viewer.robot.joints) {
        console.warn("⚠️ viewer.robot.joints missing.");
        return [];
    }

    const ordered = [];
    let currentJoint = null;

    // Base-Joint = the first URDFJoint under URDFRobot
    for (const child of viewer.robot.children) {
        if (child.type === "URDFJoint") {
            currentJoint = child;
            break;
        }
    }

    while (currentJoint) {
        const jointName = currentJoint.name;
        const jointObj = viewer.robot.joints[jointName];

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




let axisToJointMap = null;

function buildAxisToJointMap(anglesMsg) {
    // OPC UA sort Axis
    const axisNames = Object.keys(anglesMsg.angles).sort((a, b) => {
        const ai = parseInt(a.match(/(\d+)$/)?.[1] || "0", 10);
        const bi = parseInt(b.match(/(\d+)$/)?.[1] || "0", 10);
        return ai - bi;
    });

    // Find URDF joints in a chain
    const urdfJointNames = getOrderedRevoluteJointNames();

    // Take the minimum of the two (if the robot has fewer axes than OPC or vice versa)
    const n = Math.min(axisNames.length, urdfJointNames.length);

    const map = {};
    for (let i = 0; i < n; i++) {
        map[axisNames[i]] = urdfJointNames[i];
    }

    axisToJointMap = map;

    //Debug
    console.group("Axis → URDF Mapping");
    axisNames.forEach((axis, i) => {
        console.log(`${axis} → ${map[axis] || "(no URDF Joint)"}`);
    });
    console.groupEnd();

    try {
        buildEndEffectorMap();
    } catch (e) {
        console.warn("⚠️ Endeffektor-Map Fehler:", e);
    }

    return map;
}

let endEffectorMap = null;

function buildEndEffectorMap() {
    if (!viewer?.robot?.joints) {
        console.warn("⚠️ viewer.robot.joints missing.");
        endEffectorMap = { byIndex: {}, byName: {}, byParent: {} };
        return endEffectorMap;
    }

    const all = Object.values(viewer.robot.joints);
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

    endEffectorMap = { byIndex, byName, byParent };

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

    return endEffectorMap;
}



function loadDeviceSet(opcUaUrl) {
    const encodedUrl = encodeURIComponent(opcUaUrl);
    fetch(`${host}/device_set_rendered?url=${encodedUrl}`)
        .then(res => res.text())
        .then(html => {
            document.getElementById('info-content').innerHTML = html;
        });
}

function saveLastOpenNodeId(nodeId) {
    localStorage.setItem('opcuaLastOpenNode', nodeId);
}

function getLastOpenNodeId() {
    return localStorage.getItem('opcuaLastOpenNode');
}

function getLastOpcUaUrl() {
    return localStorage.getItem('lastOpcUaUrl');
}

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


window.addEventListener('load', () => {
    // Enable Hide Fixed Joints when loading
    const hideFixedToggle = document.getElementById('hide-fixed');
    hideFixedToggle.dispatchEvent(new Event('click'));

    // --- Get URL and NodeId from localStorage ---
    // connectedUrl = getLastOpcUaUrl();      // <-- Initialize here!
    const lastNodeId = getLastOpenNodeId();

    var url = get_ws_url("/ws");
    socket = new WebSocket(url);

    socket.onopen = () => {
        console.log("WebSocket connection established.");
        socket.send("status");

        const lastNodeId = localStorage.getItem('opcuaLastOpenNode');

    };


    socket.onmessage = (event) => {
        console.log("Message from server:", event.data);
        const data = event.data;
        // Check whether the message should be output using the flag “x|”
        if (event.data.startsWith("x|")) {

            if (data.startsWith("x|custom:")) {
                try {
                    const payload = JSON.parse(data.slice("x|custom:".length));
                    if (payload.nodeId && typeof payload.value !== "undefined") {
                        updateSubscriptionTable(payload.nodeId, payload.value);
                        if (showSubscriptionsTabOnNextCustom) {
                            const tabBtn = document.querySelector('.tab-btn[data-tab="subscriptions"]');
                            if (tabBtn) tabBtn.click();
                            showSubscriptionsTabOnNextCustom = false;
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
                        const manuField = document.getElementById('robot-manufacturer');
                        if (manuField) manuField.textContent = payload.manufacturer;
                    }
                    if (payload.model) {
                        const modelField = document.getElementById('robot-model');
                        if (modelField) modelField.textContent = ' ' + payload.model;
                    }

                    if (payload.gotoMethodNodeId) {
                        gotoMethodNodeId = payload.gotoMethodNodeId;
                        const urlKey = connectedUrl || getLastOpcUaUrl() || "";
                        if (urlKey) localStorage.setItem(`gotoNodeId:${urlKey}`, gotoMethodNodeId);
                    }

                    if (payload.toggleEndEffMethodNodeId) {
                        toggleEndEffMethodNodeId = payload.toggleEndEffMethodNodeId;
                        const urlKey = connectedUrl || getLastOpcUaUrl() || "";
                        if (urlKey) localStorage.setItem(`toggleEndEffNodeId:${urlKey}`, toggleEndEffMethodNodeId);
                    }
                } catch (e) {
                    console.warn("Event parse error", e);
                }
            }


            if (typeof event.data === "string" && event.data.startsWith("x|Mode:")) {
                const modeValue = event.data.replace("x|Mode:", "").trim();

                const modeField = document.getElementById('robot-mode-value');
                if (modeField) {
                    modeField.textContent = modeValue;
                }
            }


            if (typeof event.data === "string" && event.data.startsWith("x|angles:")) {
                if (!viewer) viewer = document.querySelector('urdf-viewer');

                let dictStr = event.data.replace("x|angles:", "").replace(/'/g, '"');
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
                lastOpcUaAngles = anglesMsg.angles;

                if (isManipulating) {

                    lastOpcUaAngles = anglesMsg.angles;
                    return;
                }


                if (!viewer || !viewer.robot || !viewer.robot.joints) {
                    console.warn("⚠️ URDF Viewer or Robot Joints not available.");
                    return;
                }


                try {
                    buildAxisToJointMap(anglesMsg);
                    console.log(buildAxisToJointMap(anglesMsg));
                } catch (e) {
                    console.warn("❌ Could not create axis→joint mapping:", e);
                    return;
                }

                const unit = anglesMsg.unit;
                const jointValuesRad = {};
                for (const axisName in anglesMsg.angles) {
                    const jointName = axisToJointMap[axisName];
                    if (!jointName) continue;

                    let value = Number(anglesMsg.angles[axisName]) || 0;
                    if (unit && unit !== "C81") {
                        // OPC delivers degree → convert to radiant
                        value = value * Math.PI / 180;
                    }
                    // Radiant (C81 or null) → use directly
                    jointValuesRad[jointName] = value;
                }
                const success = viewer.setJointValues(jointValuesRad);
                if (!success) {
                    console.warn("⚠️ viewer.setJointValues() did not cause any change.");
                } else {
                    console.log("✅ Angle of joints updated:", jointValuesRad);
                }
            }
        } else {
            logMessageToBox(`🔔 ${event.data}`);


            // Handle method call result
            if (event.data.startsWith("Method call result:")) {
                const methodStatus = document.getElementById('method-call-status');
                const spinner = document.getElementById('method-spinner');
                const statusText = document.getElementById('method-status-text');
                spinner.style.display = 'none';


                statusText.textContent = event.data.replace("Method call result:", "").trim();

                methodStatus.style.display = 'block';
                setTimeout(() => {
                    methodStatus.style.display = 'none';
                }, 6000);
            }

            if (event.data.startsWith("✅ OPC UA server supports 'Robotics Namespace'")) {
                hasRoboticsNamespace = true
                updateRobotLockToggleVisibility();
            }

            if (event.data.startsWith("❌ 'Robotics Namespace' not listed")) {
                hasRoboticsNamespace = false
                updateRobotLockToggleVisibility();
            }


            if (event.data.startsWith("✅ Connected to ")) {
                connectedUrl = event.data.replace("✅ Connected to ", "").trim();
                loadDeviceSet(connectedUrl);
                setInfoBoxState(true);
                infoBox.style.width = "750px";
                propertiesBox.style.width = "750px";
                infoToggleBtn.textContent = "collapse »";
                infoBoxExpanded = true;
                document.getElementById('info-content').style.width = "700px";
                document.getElementById('properties-box').style.display = 'none';
            } else if (event.data.startsWith("Model:")) {
                const lines = event.data.split(/\r?\n/);
                const modelLine = lines.find(line => line.startsWith("Model:"));
                const serialLine = lines.find(line => line.startsWith("Serial Number:"));

                const model = modelLine ? modelLine.replace("Model:", "").trim() : "unknown model";
                const serial = serialLine ? serialLine.replace("Serial Number:", "").trim() : "unknown serial";

                // Update robot stats box instead of opc-ua-status
                document.getElementById('robot-name-value').textContent = model + " (" + serial + ")";
                document.getElementById('robot-status-value').textContent = 'Connected';

            } else if (event.data.startsWith("\ud83d\udd0c Disconnected from ")) {
                const url = event.data.replace("\ud83d\udd0c Disconnected from ", "").trim();
                if (connectedUrl === url) {
                    connectedUrl = null;
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
                opcUaSyncEnabled = false;
                opcUaStreamActive = false;
                // Collapse-Button 
                infoToggleBtn.style.display = "none";
                // Lock-Toggle 
                hasRoboticsNamespace = null;
                updateRobotLockToggleVisibility();
            } else if (event.data.startsWith("❌ No client found")) {
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
    };


    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
    };

    socket.onclose = () => {
        console.log("WebSocket connection closed.");
    };
});


function setInfoBoxState(expanded) {
    infoBoxExpanded = expanded;
    infoToggleBtn.style.display = "block";
    infoBox.style.width = expanded ? "750px" : "450px";
    propertiesBox.style.width = expanded ? "750px" : "450px";
    infoToggleBtn.textContent = expanded ? "collapse »" : "« expand";
}

const toggleOpcUa = document.getElementById('toggle-opc-ua');
const opcUaSection = document.getElementById('opc-ua');

toggleOpcUa.addEventListener('click', () => {
    opcUaSection.classList.toggle('hidden');
});

const toggleRobotDashboard = document.getElementById('toggle-robot-dashboard');
const robotDashboardSection = document.getElementById('robot-dashboard');
toggleRobotDashboard.addEventListener('click', () => {
    robotDashboardSection.classList.toggle('hidden');
});

const infoToggleBtn = document.getElementById("info-toggle-btn");
infoToggleBtn.style.display = "none";

document.getElementById('connect-opc-ua').addEventListener('click', function () {
    const urlInput = document.getElementById('opc-ua-url');
    const url = urlInput.value.trim();

    if (!url) {
        alert('Please enter a valid OPC UA Server URL.');
        return;
    }

    const message = `connect|${url}`;

    console.log("Sending:", message);
    infoToggleBtn.style.display = "block";
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
    } else {
        alert("WebSocket is not connected.");
    }
    localStorage.setItem('lastOpcUaUrl', url);
});


document.getElementById('disconnect-opc-ua').addEventListener('click', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const url = document.getElementById('opc-ua-url').value.trim();
        if (!url) {
            alert("No URL specified.");
            return;
        }
        socket.send(`disconnect|${url}`);
        document.getElementById('info-content').style.width = "400px";
    } else {
        alert("WebSocket is not connected.");
    }
});


function showNodeProperties(element) {
    const propertiesBox = document.getElementById("properties-box");
    const table = document.getElementById("properties-table");

    const dataset = element.dataset;
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
opcUaSyncEnabled = true;
const opcUaSyncToggle = document.getElementById('opc-ua-sync-toggle');
opcUaSyncToggle.addEventListener('change', function () {
    if (!connectedUrl) {
        this.checked = false;
        opcUaSyncEnabled = false;
        logMessageToBox('❌ No OPC UA client connected. Please connect first.');
        return;
    }

    if (!hasRoboticsNamespace) {
        this.checked = false;
        opcUaSyncEnabled = false;
        logMessageToBox('❌ No OPC UA robotics server connected.');
        return;
    }

    opcUaSyncEnabled = this.checked;
    const url = document.getElementById('opc-ua-url').value.trim();
    if (opcUaSyncEnabled) {
        if (!opcUaStreamActive && socket && socket.readyState === WebSocket.OPEN && url) {
            socket.send(`stream joint position|${url}`);
            socket.send(`stream mode|${url}`);
            opcUaStreamActive = true;
        }
        if (lastOpcUaAngles && viewer && viewer.robot && viewer.robot.joints) {

            try {
                buildAxisToJointMap({
                    angles: lastOpcUaAngles
                });
            } catch (e) {
                console.warn("❌ Could not create axis→joint mapping:", e);
                return;
            }


            const jointValuesRad = {};
            for (const axisName in lastOpcUaAngles) {
                const deg = Number(lastOpcUaAngles[axisName]) || 0;
                const rad = deg * Math.PI / 180;

                const jointName = axisToJointMap[axisName];
                if (jointName) {
                    jointValuesRad[jointName] = rad;
                }
            }

            viewer.setJointValues(jointValuesRad);
        }


    } else {
        if (opcUaStreamActive && socket && socket.readyState === WebSocket.OPEN && url) {
            socket.send(`cancel stream joint position|${url}`);
            socket.send(`cancel stream mode|${url}`);
            opcUaStreamActive = false;
        }
        const modeField = document.getElementById('robot-mode-value');
        if (modeField) modeField.textContent = '-';
    }
});

const opcUaSyncToggleContainer = document.getElementById('opc-ua-sync-toggle-container');
opcUaSyncToggleContainer.addEventListener('click', function (e) {
    e.stopPropagation();
}, true);

document.addEventListener("click", function (e) {
    if (e.target.closest('#custom-context-menu')) return;
    if ((e.target.tagName === "SUMMARY" || e.target.tagName === "SPAN") && e.target.dataset.nodeId) {
        selectedNodeId = e.target.dataset.nodeId;
        console.log("Selected Node ID:", selectedNodeId);
        selectedNodeElement = e.target;
        showNodeProperties(e.target);

        if (selectedNodeId) {
            localStorage.setItem('opcuaLastOpenNode', selectedNodeId);
        }

        // --- References-Tabelle aktualisieren ---
        if (selectedNodeId && connectedUrl) {
            const encodedUrl = encodeURIComponent(connectedUrl);
            const encodedNodeId = encodeURIComponent(selectedNodeId);
            fetch(`${host}/references?url=${encodedUrl}&nodeid=${encodedNodeId}`)
                .then(res => res.json())
                .then(refs => {
                    if (Array.isArray(refs)) {
                        const referencesTable = document.getElementById("references-table");
                        if (!referencesTable) return;
                        const oldTbody = referencesTable.querySelector("tbody");
                        const newTbody = document.createElement("tbody");
                        refs.forEach(refObj => {
                            const row = document.createElement("tr");
                            const refTypeCell = document.createElement("td");
                            refTypeCell.textContent = refObj.ReferenceType || "";
                            row.appendChild(refTypeCell);
                            const nodeIdCell = document.createElement("td");
                            nodeIdCell.textContent = refObj.NodeId || "";
                            row.appendChild(nodeIdCell);
                            const browseNameCell = document.createElement("td");
                            browseNameCell.textContent = refObj.BrowseName || "";
                            row.appendChild(browseNameCell);
                            const typeDefCell = document.createElement("td");
                            typeDefCell.textContent = refObj.TypeDefinition || "";
                            row.appendChild(typeDefCell);
                            newTbody.appendChild(row);
                        });
                        if (oldTbody) {
                            referencesTable.replaceChild(newTbody, oldTbody);
                        } else {
                            referencesTable.appendChild(newTbody);
                        }
                    }
                })
                .catch(err => {
                    console.warn('Error loading references:', err);
                });
        }
    }
});


document.addEventListener("click", async function (e) {
    if ((e.target.tagName === "SUMMARY" || e.target.tagName === "SPAN") && e.target.dataset.nodeId) {
        const summary = e.target;
        const details = summary.closest("details");
        let ul = details ? details.querySelector("ul") : null;

        if (details && !details.open && !ul.classList.contains("subtree-loaded")) {
            e.preventDefault();

            const encodedUrl = encodeURIComponent(connectedUrl);
            const nodeId = encodeURIComponent(summary.dataset.nodeId);
            const resp = await fetch(`${host}/subtree_children?url=${encodedUrl}&nodeid=${nodeId}`);
            const html = await resp.text();

            const staging = document.createElement("div");
            staging.innerHTML = html;
            ul.innerHTML = staging.innerHTML;
            ul.classList.add("subtree-loaded");

            details.open = true;

            selectedNodeId = summary.dataset.nodeId;
            selectedNodeElement = summary;
            showNodeProperties(summary);
            return;
        }
        selectedNodeId = summary.dataset.nodeId;
        selectedNodeElement = summary;
        showNodeProperties(summary);
    }

});


document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");

        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        document.querySelectorAll(".tab-content").forEach((content) => {
            content.classList.remove("active");
        });
        document.getElementById(`tab-${tab}`).classList.add("active");
    });
});

function logMessageToBox(msg) {
    const logContainer = document.getElementById('message-log');
    const line = document.createElement('div');
    line.classList.add('log-entry');
    line.textContent = msg;
    logContainer.prepend(line);
}


document.getElementById('clear-log-btn').addEventListener('click', () => {
    const logContainer = document.getElementById('message-log');
    logContainer.innerHTML = '';
});




document.addEventListener("contextmenu", function (e) {
    const target = e.target;
    if ((target.matches("summary, span")) && target.dataset.nodeId) {
        e.preventDefault();
        selectedNodeId = target.dataset.nodeId;
        selectedNodeElement = target;
        const menu = document.getElementById("custom-context-menu");
        menu.style.top = e.pageY + "px";
        menu.style.left = e.pageX + "px";
        menu.style.display = "block";
    } else {
        document.getElementById("custom-context-menu").style.display = "none";
        selectedNodeId = null;
        selectedNodeElement = null;
    }
});

document.addEventListener("click", function (e) {
    if ((e.target.tagName === "SUMMARY" || e.target.tagName === "SPAN") && e.target.dataset.nodeId) {
        selectedNodeId = e.target.dataset.nodeId;
        selectedNodeElement = e.target;

        const nodeClass = selectedNodeElement.dataset.nodeclass;

        if (nodeClass == "2") {
            if (e.target.tagName === "SPAN") {
                refreshSelectedNode();
            }
        }

        showNodeProperties(e.target);
    }
});


document.getElementById('context-call-method').addEventListener('click', function () {
    const menu = document.getElementById("custom-context-menu");
    menu.style.display = "none";

    if (!selectedNodeId || !selectedNodeElement) {
        alert('❌ No node selected. (nodeId missing)');
        return;
    }

    const nodeClass = selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "4") {
        alert("❌ This node is not a method (NodeClass ≠ 4).");
        return;
    }

    // Suche nach InputArguments in den Kind-Elementen
    const inputNode = Array.from(
        selectedNodeElement.parentElement.querySelectorAll("summary, span")
    ).find(el => el.dataset.name && el.dataset.name.endsWith('InputArguments'));


    const methodStatus = document.getElementById('method-call-status');
    const spinner = document.getElementById('method-spinner');
    const statusText = document.getElementById('method-status-text');

    if (inputNode) {
        const rawValue = inputNode.getAttribute('data-value');
        const nodeIdForCall = selectedNodeId;
        showInputParameterPopup(rawValue, (userInputs) => {
            const payload = {
                nodeId: nodeIdForCall,
                inputs: userInputs,
                url: connectedUrl,
            };
            methodStatus.style.display = 'flex';
            spinner.style.display = 'inline-block';
            statusText.textContent = `Method is being executed...`;
            socket.send(`call|${JSON.stringify(payload)}`);
        });
    } else {
        methodStatus.style.display = 'flex';
        spinner.style.display = 'inline-block';
        statusText.textContent = `Method is being executed...`;
        const payload = {
            nodeId: selectedNodeId,
            inputs: "",
            url: connectedUrl,
        };
        socket.send(`call|${JSON.stringify(payload)}`);
    }
});


document.getElementById('context-subscribe').addEventListener('click', function () {
    document.getElementById("custom-context-menu").style.display = "none";
    if (!selectedNodeId || !selectedNodeElement) {
        alert('❌ No node selected. (nodeId missing)');
        return;
    }

    const nodeClass = selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "2") {
        alert("❌ This node is not a variable (NodeClass ≠ 2).");
        return;
    }
    if (selectedNodeId && connectedUrl) {
        const payload = {
            url: connectedUrl,
            nodeId: selectedNodeId
        };
        socket.send("subscribe|" + JSON.stringify(payload));
        showSubscriptionsTabOnNextCustom = true;
    }
});

document.getElementById('context-unsubscribe').addEventListener('click', function () {
    document.getElementById("custom-context-menu").style.display = "none";
    if (!selectedNodeId || !selectedNodeElement) {
        alert('❌ No node selected. (nodeId missing)');
        return;
    }

    const nodeClass = selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "2") {
        alert("❌ This node is not a variable (NodeClass ≠ 2).");
        return;
    }
    if (selectedNodeId && connectedUrl) {
        const payload = {
            url: connectedUrl,
            nodeId: selectedNodeId
        };
        socket.send("unsubscribe|" + JSON.stringify(payload));
    }
});

document.getElementById('context-subscribe_event').addEventListener('click', function () {
    document.getElementById("custom-context-menu").style.display = "none";

    if (!selectedNodeId || !selectedNodeElement) {
        alert('❌ No node selected. (nodeId missing)');
        return;
    }

    const nodeClass = selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "1") {
        alert("❌ This node is not an object (NodeClass ≠ 1).");
        return;
    }
    if (selectedNodeId && connectedUrl) {
        const payload = {
            url: connectedUrl,
            nodeId: selectedNodeId
        };
        socket.send("subscribeEvent|" + JSON.stringify(payload));
        showSubscriptionsTabOnNextCustom = true;
    }
});

document.getElementById('context-unsubscribe_event').addEventListener('click', function () {
    document.getElementById("custom-context-menu").style.display = "none";
    if (!selectedNodeId || !selectedNodeElement) {
        alert('❌ No node selected. (nodeId missing)');
        return;
    }

    const nodeClass = selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "1") {
        alert("❌ This node is not an object (NodeClass ≠ 1).");
        return;
    }
    if (selectedNodeId && connectedUrl) {
        const payload = {
            url: connectedUrl,
            nodeId: selectedNodeId
        };
        socket.send("unsubscribeEvent|" + JSON.stringify(payload));
    }
});


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

window.addEventListener('mousedown', function (e) {
    const menu = document.getElementById('custom-context-menu');
    if (menu.style.display === 'block' && !menu.contains(e.target)) {
        menu.style.display = 'none';
    }
});


const infoBox = document.getElementById("info-box");
const propertiesBox = document.getElementById("properties-box");
const toggleBtn = document.getElementById("info-toggle-btn");

const syncInfoPropertiesWidth = () => {
    propertiesBox.style.width = infoBox.style.width;
};

// Initial sync
syncInfoPropertiesWidth();

// Expand/Collapse Button
let infoBoxExpanded = true;
toggleBtn.addEventListener("click", () => {
    if (infoBoxExpanded) {
        infoBox.style.width = "450px";
        propertiesBox.style.width = "450px";
        toggleBtn.textContent = "« expand";
    } else {
        infoBox.style.width = "750px";
        propertiesBox.style.width = "750px";
        toggleBtn.textContent = "collapse »";
    }
    infoBoxExpanded = !infoBoxExpanded;
});

const observer = new MutationObserver(() => {
    syncInfoPropertiesWidth();
});
observer.observe(infoBox, {
    attributes: true,
    attributeFilter: ['style']
});

const animToggleBlocker = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
        if (
            mutation.type === 'attributes' &&
            mutation.attributeName === 'class' &&
            mutation.target.id === 'do-animate' &&
            mutation.target.classList.contains('checked')
        ) {
            mutation.target.classList.remove('checked');
        }
    }
});

// Starte den Observer möglichst früh
window.addEventListener('DOMContentLoaded', () => {
    const animToggle = document.getElementById('do-animate');
    if (animToggle) {
        animToggleBlocker.observe(animToggle, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
});

// Merker für letzte EEF-Positionen
let lastEEFPositions = {};

function getVal(j) {
    return Array.isArray(j.jointValue) ? Number(j.jointValue[0]) : Number(j.angle || 0);
}
function getLimits(j) {
    const lim = j?.limit || j?._limit || j?._raw?.limit || {};
    const toNum = v => (v === undefined || v === null || v === '' ? NaN : Number(v));
    return { lower: toNum(lim.lower ?? lim.min), upper: toNum(lim.upper ?? lim.max) };
}
function getEEFMasters(robot) {
    if (window.endEffectorMap?.byName) {
        return Object.keys(endEffectorMap.byName)
            .map(n => robot.joints[n])
            .filter(j => j && j.jointType === 'prismatic' && !j.mimic);
    }
    return Object.values(robot.joints).filter(j => j.jointType === 'prismatic' && !j.mimic);
}


window.addEventListener('DOMContentLoaded', () => {
    viewer = document.querySelector('urdf-viewer');
    const animToggle = document.getElementById('do-animate');

    viewer.camera.position.set(-0.5, 1.1, 0.8);


    if (!viewer || !animToggle) {
        console.warn('URDF Viewer not found.');
        return;
    }

    viewer.addEventListener('urdf-processed', () => {
        animToggle.classList.remove('checked');
        animToggle.remove(animToggle);

        function updateRevoluteJointStatus() {
            const r = viewer.robot;
             console.log(r);


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

            const statusField = document.getElementById('robot-position-value');
            if (statusField) {
                statusField.textContent = jointValues.join(', ');
            }
            const TCPField = document.getElementById('robot-tcp-value');

            if (TCPField) {
                TCPField.textContent = 'Pos: ' + viewer.targetObject.position.toArray().map(coord => coord.toFixed(3)).join(', ') + ' ;Rot: ' + viewer.targetObject.quaternion.toArray().map(coord => coord.toFixed(3)).join(', ');

            }


        }

        updateRevoluteJointStatus();

        viewer.addEventListener('angle-change', () => {
            updateRevoluteJointStatus();
        });

        document.getElementById('radians-toggle').addEventListener('click', () => {
            setTimeout(() => {
                updateRevoluteJointStatus();
            }, 0);
        });

        viewer.addEventListener('manipulate-start', () => {
            isManipulating = true;
        });
        viewer.addEventListener('manipulate-end', () => {
    isManipulating = false;
    const syncToggle = document.getElementById('opc-ua-sync-toggle');
    if (!syncToggle || !syncToggle.checked) return;

    const r = viewer.robot;
    if (!r || !r.joints) return;

    const eefMasters = getEEFMasters(r);
    let eefTriggered = false;

    // --- Endeffektor prüfen ---
    for (const j of eefMasters) {
        const cur = getVal(j);
        const last = lastEEFPositions[j.name];
        const changed = (last !== undefined) && (cur !== last);

        if (changed) {
            const { lower, upper } = getLimits(j);
            const atLower = (cur === lower);
            const atUpper = (cur === upper);

            if (atLower || atUpper) {
                let nodeId = toggleEndEffMethodNodeId || localStorage.getItem(`toggleEndEffNodeId:${connectedUrl}`);
                if (!nodeId) {
                    logMessageToBox('⚠️ “toggleEndEff” method not yet known. Please connect or try again.');
                    break;
                }

                const payload = { nodeId, url: connectedUrl };
                console.log("Send End Effector after limit reached:", payload);
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(`call|${JSON.stringify(payload)}`);
                    eefTriggered = true;
                }
                break; // nur ein EEF-Call
            }
        }
    }

    // letzte EEF-Positionen merken
    eefMasters.forEach(j => { lastEEFPositions[j.name] = getVal(j); });

    if (eefTriggered) return; // nur Endeffektor gesendet → fertig

    // --- Revolute prüfen: nur senden, wenn sich was geändert hat ---
    const jointValuesRad = [];
    let revoluteChanged = false;

    for (const name in r.joints) {
        const joint = r.joints[name];
        if (joint.jointType === 'revolute') {
            let value = Array.isArray(joint.jointValue) ? joint.jointValue[0] : joint.angle;
            jointValuesRad.push(parseFloat(value.toFixed(6)));

            // prüfen ob sich gegenüber letztem Stand geändert hat
            if (lastEEFPositions[name] === undefined || lastEEFPositions[name] !== value) {
                revoluteChanged = true;
            }
        }
    }

    if (!revoluteChanged) return; // nix Neues → kein GoTo

    const jointsString = JSON.stringify(jointValuesRad);
    let nodeId = gotoMethodNodeId || localStorage.getItem(`gotoNodeId:${connectedUrl}`);
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
        url: connectedUrl
    };

    console.log("Send Go To after drag end:", payload);
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(`call|${JSON.stringify(payload)}`);
    }
});

    });
});

window.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('opc-ua-url');
    const lastUrl = localStorage.getItem('lastOpcUaUrl');
    if (lastUrl && urlInput) {
        urlInput.value = lastUrl;
    }
});


function refreshSelectedNode() {
    if (!selectedNodeId || !connectedUrl) return;

    let el = document.querySelector(`[data-node-id="${selectedNodeId}"]`);
    if (!el) return;

    const nodeClass = el.dataset.nodeclass;
    const li = el.closest('li');
    if (!li) return;

    if (nodeClass == "2") {
        const hasChildren = li.querySelector('ul') && li.querySelector('ul').children.length > 0;
        if (hasChildren) {

            return;
        }
        const encodedUrl = encodeURIComponent(connectedUrl);
        const encodedNodeId = encodeURIComponent(selectedNodeId);
        fetch(`${host}/node_rendered?url=${encodedUrl}&nodeid=${encodedNodeId}&children_depth=1`)
            .then(res => res.text())
            .then(html => {
                const staging = document.createElement('div');
                staging.innerHTML = html;
                li.replaceWith(...staging.childNodes);

                const newNode = document.querySelector(`[data-node-id="${selectedNodeId}"]`);
                if (newNode) {
                    selectedNodeElement = newNode;
                    showNodeProperties(newNode);
                }
            });
        return;
    }

    showNodeProperties(el);
}
document.getElementById('refresh-info-box').addEventListener('click', refreshSelectedNode);


function updateReferencesTable(refObj, clearFirst = false) {
    const table = document.getElementById("references-table");
    if (!table) return;

    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    if (clearFirst) {
        tbody.innerHTML = "";
    }

    const row = document.createElement("tr");

    const refTypeCell = document.createElement("td");
    refTypeCell.textContent = refObj.ReferenceType || "";
    row.appendChild(refTypeCell);

    const nodeIdCell = document.createElement("td");
    nodeIdCell.textContent = refObj.NodeId || "";
    row.appendChild(nodeIdCell);

    const browseNameCell = document.createElement("td");
    browseNameCell.textContent = refObj.BrowseName || "";
    row.appendChild(browseNameCell);

    const typeDefCell = document.createElement("td");
    typeDefCell.textContent = refObj.TypeDefinition || "";
    row.appendChild(typeDefCell);

    tbody.appendChild(row);
}

const robotLockToggleContainer = document.getElementById('robot-lock-toggle-container');
if (robotLockToggleContainer) {
    robotLockToggleContainer.style.display = 'none';
}

function updateRobotLockToggleVisibility() {
    const container = document.getElementById('robot-lock-toggle-container');
    if (!container) return;
    if (hasRoboticsNamespace === true) {
        container.style.display = '';
    } else {
        container.style.display = 'none';
    }
}

const homeIcon = document.getElementById('home-icon');
if (homeIcon) {
    homeIcon.addEventListener('click', () => {
        const viewer = document.querySelector('urdf-viewer');
        if (viewer && viewer.camera) {

            viewer.dispatchEvent(new Event('reset-angles'));


        }
    });
}

function setup_mcp_socket() {
    var url = get_ws_url("/ws_mcp");
    socket_mcp = new WebSocket(url);

    socket_mcp.onopen = () => {
        console.log("MCP WebSocket connection established.");
        socket_mcp.send("status");
    };

    socket_mcp.onmessage = (event) => {
        console.log("MCP Message from server:", event.data);
        const data = event.data;
        let r = viewer.robot;
        if (event.data.startsWith("TCP_POS|")) {
            let tcp_pos = event.data.replace("TCP_POS|", "");
            let tcp_coords = tcp_pos.split(",");
            let position = new Vector3(parseFloat(tcp_coords[0]), parseFloat(tcp_coords[1]), parseFloat(tcp_coords[2]))
            viewer.targetObject.position.set(...position);
            // console.log('Target pos2:', viewer.targetObject.position);
            viewer.solve();
            viewer.dispatchEvent(new Event('manipulate-end'));
            viewer.dispatchEvent(new Event('change'));
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

            viewer.setJointValues(jointValuesRad);
        } else if (event.data.startsWith("JOINT|")) {
            let joint_raw_data = event.data.replace("JOINT|", "").split("|");
            let joint_index = joint_raw_data[0];
            let joint_angle = joint_raw_data[1];
        } else if (event.data.startsWith("OPCUA-NODE|")) {

        }
    };

    socket_mcp.onerror = (error) => {
        console.error("MCP WebSocket error:", error);
        document.getElementById('mcp-integration-toggle').checked = false;
    };

    socket_mcp.onclose = () => {
        console.log("MCP WebSocket connection closed.");
        document.getElementById('mcp-integration-toggle').checked = false;
    };
}

function disconnect_mcp_socket() {
    if (socket_mcp != null) {
        socket_mcp.close();
    }
}

document.getElementById('mcp-integration-toggle').addEventListener('click', (e) => {
    if (e.target.checked) {
        setup_mcp_socket();
    } else {
        disconnect_mcp_socket();
    }
});

viewer = document.querySelector('urdf-viewer');
viewer.addEventListener('angle-change', () => {
    if (socket_mcp == null || socket_mcp.readyState != WebSocket.OPEN) {
        return;
    }
    socket_mcp.send('TCP|' + 'Pos: ' + viewer.targetObject.position.toArray().map(coord => coord.toFixed(3)).join(', ') + ' ;Rot: ' + viewer.targetObject.quaternion.toArray().map(coord => coord.toFixed(3)).join(', '));
    const r = viewer.robot;
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
                formatted = num.toFixed(1); // Grad: 1 Nachkommastelle
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
    socket_mcp.send('ANGLES|' + jointValues.join(', '));
})
