import { Vector3 } from "three";

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

// Robot — Drag End Helpers
// Merker für letzte EEF-Positionen
function getVal(j) {
    return Array.isArray(j.jointValue) ? Number(j.jointValue[0]) : Number(j.angle || 0);
}
function getLimits(j) {
    const lim = j?.limit || j?._limit || j?._raw?.limit || {};
    const toNum = v => (v === undefined || v === null || v === '' ? NaN : Number(v));
    return { lower: toNum(lim.lower ?? lim.min), upper: toNum(lim.upper ?? lim.max) };
}
function getEEFMasters(robot) { //TODO is this endEffector the old variable or something else
//maybe we need to give it a recordRobot parameter so it uses the correct endeffectormap of the robot
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
    const manipulator = robotRecord.manipulator;
    const { opcua, connectivity, interaction } = robotRecord.state;
    //interaction.isManipulating = false; //already done in index.js

    const syncToggle = document.getElementById('opc-ua-sync-toggle');
    if (!syncToggle?.checked) return;

    const r = manipulator.robot;
    if (!r?.joints) return;

    const eefMasters = getEEFMasters(r);
    let eefTriggered = false;

    // --- Endeffektor prüfen ---
    for (const j of eefMasters) {
        const cur = getVal(j);
        const last = opcua.mapping.lastEEFPositions?.[j.name];
        const changed = (last !== undefined) && (cur !== last);

        if (changed) {
            const { lower, upper } = getLimits(j);
            const atLower = (cur === lower);
            const atUpper = (cur === upper);

            if (atLower || atUpper) {
                const nodeId = opcua.metadata.toggleEndEffMethodNodeId;
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
        if (!opcua.mapping.lastEEFPositions) {
            opcua.mapping.lastEEFPositions = {};
        }
        opcua.mapping.lastEEFPositions[j.name] = getVal(j);
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
            const lastEEFPositions = opcua.mapping.lastEEFPositions?.[name];
            if (lastEEFPositions === undefined || lastEEFPositions !== value) {
                revoluteChanged = true;
            }
        }
    }

    if (!revoluteChanged) return; // nix Neues → kein GoTo

    const jointsString = JSON.stringify(jointValuesRad);
    const nodeId = opcua.metadata.gotoMethodNodeId;

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

// Robot Reset
export function handleHomeClick(robotRecord) {
    const manipulator = robotRecord.manipulator;
    if (manipulator) {
        manipulator.dispatchEvent(new Event('reset-angles'));
    }
}


function updateRobotLockToggleVisibility(robotRecord) {
    const container = document.getElementById('robot-lock-toggle-container');
    if (!container) return;

    if (!robotRecord) {
        container.style.display = 'none';
        return;
    }
    const { metadata } = robotRecord.state.opcua;
    const hasRoboticsNamespace = metadata.hasRoboticsNamespace === true;
    container.style.display = hasRoboticsNamespace ? '' : 'none';
}
