/*
UI state helpers remain per robot. Keep new code following this pattern.
*/
import { getActiveRobot } from '../robot/robotManager.js';
import { setInfoBoxState } from '../ui/layout.js';
import { logMessageToBox } from '../ui/logging.js';


// Format revolute joint angles for display/logging; respects the radians toggle.
export function getFormattedJointString(robotRecord) {
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

// Update dashboard labels (joint + TCP) only if this robot is active.
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
// Helper methods for handleManipulateEnd.

function getVal(j) {
    return Array.isArray(j.jointValue) ? Number(j.jointValue[0]) : Number(j.angle || 0);
}

// Read limits safely for mimic/end effector checks.
function getLimits(j) {
    const lim = j?.limit || j?._limit || j?._raw?.limit || {};
    const toNum = v => (v === undefined || v === null || v === '' ? NaN : Number(v));
    return { lower: toNum(lim.lower ?? lim.min), upper: toNum(lim.upper ?? lim.max) };
}
// Find prismatic masters for end effector toggling.
function getEEFMasters(robot) {
    if (window.endEffectorMap?.byName) {
        return Object.keys(endEffectorMap.byName)
            .map(n => robot.joints[n])
            .filter(j => j && j.jointType === 'prismatic' && !j.mimic);
    }
    return Object.values(robot.joints).filter(j => j.jointType === 'prismatic' && !j.mimic);
}

// After user moves the robot, decide whether to call OPC UA GoTo or toggle the end effector.
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

    // Check end effector travel.
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
                    logMessageToBox('⚠️ toggleEndEff method not yet known. Please connect or try again.');
                    break;
                }

                const payload = { nodeId, url: connectivity.connectedUrl };
                console.log("Send end effector after limit reached:", payload);

                if (connectivity.socket && connectivity.socket.readyState === WebSocket.OPEN) {
                    connectivity.socket.send(`call|${JSON.stringify(payload)}`);
                    eefTriggered = true;
                }
                break; // only one end-effector call
            }
        }
    }
    // Store latest end-effector positions.
    // letzte EEF-Positionen merken
    eefMasters.forEach(j => { 
        if (!opcua.lastEEFPositions) {
            opcua.lastEEFPositions = {};
        }
        opcua.lastEEFPositions[j.name] = getVal(j);
    });

    if (eefTriggered) return; // end-effector call sent; nothing else to do

    // Check revolute joints; send only if changed.
    const jointValuesRad = [];
    let revoluteChanged = false;

    for (const name in r.joints) {
        const joint = r.joints[name];
        if (joint.jointType === 'revolute') {
            const value = Array.isArray(joint.jointValue) ? joint.jointValue[0] : joint.angle;
            jointValuesRad.push(parseFloat(value.toFixed(6)));

            // Check if value changed since last time.
            const lastEEFPositions = opcua.lastEEFPositions?.[name];
            if (lastEEFPositions === undefined || lastEEFPositions !== value) {
                revoluteChanged = true;
            }
        }
    }

    if (!revoluteChanged) return; // no change; skip GoTo

    const jointsString = JSON.stringify(jointValuesRad);
    const nodeId = opcua.gotoMethodNodeId;

    if (!nodeId) {
        logMessageToBox('⚠️ Go To method not yet known. Please connect or try again.');
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

// Reset robot pose to home for this manipulator.
export function handleHomeClick(robotRecord) {
    const manipulator = robotRecord.manipulator;
    if (manipulator) {
        manipulator.dispatchEvent(new Event('reset-angles'));
    }
}

// Restore or clear UI panels when switching active robots.
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

// Show or hide the lock toggle based on robotics namespace support for the active robot.
export function updateRobotLockToggleVisibility(robotRecord) {
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