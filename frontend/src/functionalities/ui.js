
// ui toggles

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
// tab switching
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

//node properties

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

//reference table
function updateReferencesTable(refs, clearFirst = false) {
    const referencesTable = document.getElementById("references-table");
    if (!referencesTable) return;
    const oldTbody = referencesTable.querySelector("tbody");
    const newTbody = document.createElement("tbody");

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


// Node Tree Click Handling
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

        showNodeProperties(e.target);
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

    showNodeProperties(el);
}
// Context Menu
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


export function handleGlobalMouseDown(e) {
    const menu = document.getElementById('custom-context-menu');
    if (menu.style.display === 'block' && !menu.contains(e.target)) {
        menu.style.display = 'none';
    }
}



// Context Menu Actions

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
}

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
}

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
}

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

// logging
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

//ui utilities

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