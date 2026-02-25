import { getActiveRobot } from '../robot/robotManager.js';
import { logMessageToBox } from '../ui/logging.js';

export function showNodeProperties(element, robotRecord) {
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

//helper for handleOpcUaNodeSelection
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
