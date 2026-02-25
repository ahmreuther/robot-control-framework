import { showNodeProperties, refreshSelectedNode } from '../opcua/addressSpace';

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

//helper for handleContextCallMethod
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

export function handleGlobalMouseDown(e) {
    const menu = document.getElementById('custom-context-menu');
    if (menu.style.display === 'block' && !menu.contains(e.target)) {
        menu.style.display = 'none';
    }
}