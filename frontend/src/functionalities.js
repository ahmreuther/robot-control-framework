let socket;
let viewer = null;
let opcUaSyncEnabled;
let isMouseDownOnJoint = false; // Flag to track mouse down state on joint elements
let connectedUrl;
let opcUaStreamActive = false;
let lastOpcUaAngles = null;
let isManipulating = false;
let selectedNodeId = null;
let selectedNodeElement = null; // wird beim Rechtsklick gesetzt
let showSubscriptionsTabOnNextCustom = false; // Flag für den nächsten Tab-Wechsel
let hasRoboticsNamespace = null




function loadDeviceSet(opcUaUrl) {
    const encodedUrl = encodeURIComponent(opcUaUrl);
    fetch(`http://127.0.0.1:8000/device_set_rendered?url=${encodedUrl}`)
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

        // NodeId Zelle
        const cellNodeId = document.createElement("td");
        cellNodeId.textContent = nodeId;
        row.appendChild(cellNodeId);

        // Value Zelle
        const cellValue = document.createElement("td");
        cellValue.className = "subscription-value";
        cellValue.textContent = value;
        row.appendChild(cellValue);

        table.querySelector("tbody").appendChild(row);
    } else {
        // Value aktualisieren
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
    // Hide Fixed Joints beim Laden aktivieren
    const hideFixedToggle = document.getElementById('hide-fixed');
    hideFixedToggle.dispatchEvent(new Event('click'));

    // --- URL und NodeId aus localStorage holen ---
    // connectedUrl = getLastOpcUaUrl();      // <-- Initialisiere hier!
    const lastNodeId = getLastOpenNodeId();

    socket = new WebSocket("ws://127.0.0.1:8000/ws");

    socket.onopen = () => {
        console.log("WebSocket connection established.");
        socket.send("status");

        const lastNodeId = localStorage.getItem('opcuaLastOpenNode');

    };



    socket.onmessage = (event) => {
        console.log("Message from server:", event.data);
        const data = event.data;
        // Prüfe, ob die Nachricht ausgegeben werden soll anhand der Flag "x|"
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
                // Prüfe, ob JSON oder plain nodeId:
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
                    // Nur nodeId als String
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
                        // Entferne "No events captured" falls vorhanden
                        const noEvents = eventsContainer.querySelector('.no-events-captured');
                        if (noEvents) noEvents.remove();
                        // Neueste Events oben einfügen
                        eventsContainer.prepend(p);
                    }
                } catch (e) {
                    console.warn("Event parse error", e);
                }
            }





            if (data.startsWith("x|robotinfo:")) {
                try {

                    const payload = JSON.parse(data.slice("x|robotinfo:".length));
                    if (payload.manufacturer) {
                        const manuField = document.getElementById('robot-manufacturer');
                        if (manuField) manuField.textContent = payload.manufacturer;
                    }
                    if (payload.model) {
                        const modelField = document.getElementById('robot-model');
                        if (modelField) modelField.textContent = ' ' + payload.model;
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
                    console.warn("❌ Fehler beim Parsen der Achsdaten:", dictStr, e);
                    return;
                }
                lastOpcUaAngles = anglesMsg.angles; // Merke letzten Stand

                if (isManipulating) {
                    // Optional: speichere die letzte Nachricht für später, falls du sie nach Drag-End noch anwenden willst
                    lastOpcUaAngles = anglesMsg.angles;
                    return;
                }

                // Mapping zu tatsächlichen jointNames im viewer
                if (!viewer || !viewer.angles) {
                    console.warn("⚠️ URDF-Viewer oder Gelenkwinkel nicht verfügbar.");
                    return;
                }
                const jointNames = Object.keys(viewer.angles);

                // Prüfe Einheit und wandle ggf. um
                const unit = anglesMsg.unit;
                console.log("Unit:", unit);
                const jointValuesRad = {};
                for (const axisName in anglesMsg.angles) {
                    let value = anglesMsg.angles[axisName];
                    // Wenn unit === "C81", dann sind es Radiant und müssen in Grad umgerechnet werden
                    // (viewer erwartet Radiant!)
                    if (unit === "C81") {
                        // Wert ist in Radiant, viewer erwartet Radiant → direkt übernehmen
                        // (Falls du im Viewer Grad erwartest, dann value = value * 180 / Math.PI)
                    } 
                    
                    else if (unit === null) {
                        // Wert ist in Radiant, viewer erwartet Radiant → direkt übernehmen
                        // (Falls du im Viewer Grad erwartest, dann value = value * 180 / Math.PI)
                    }
                    else {
                        // Wert ist in Grad, für den Viewer in Radiant umrechnen
                        value = value * Math.PI / 180;
                    }

                    const match = axisName.match(/(\d+)$/);  // "Axis_3" → 3
                    if (match) {
                        const idx = parseInt(match[1], 10) - 1;
                        const jointName = jointNames[idx];    // → z. B. "joint2"
                        console.log(idx, jointNames);
                        if (jointName) {
                            jointValuesRad[jointName] = value;
                        }
                    }
                }
                const success = viewer.setJointValues(jointValuesRad);
                console.log(jointValuesRad);
                if (!success) {
                    console.warn("⚠️ viewer.setJointValues() hat keine Änderung bewirkt.");
                } else {
                    console.log("✅ Gelenkwinkel aktualisiert:", jointValuesRad);
                }
            }
        }
        else {
            logMessageToBox(`🔔 ${event.data}`);



            // Handle method call result
            if (event.data.startsWith("Method call result:")) {
                const methodStatus = document.getElementById('method-call-status');
                const spinner = document.getElementById('method-spinner');
                const statusText = document.getElementById('method-status-text');
                spinner.style.display = 'none';

                // Zeige einfach den Originalstring aus dem Backend an!
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
                // Properties-Box nach Connect immer ausblenden (leerer Zustand)
                document.getElementById('properties-box').style.display = 'none';
            }



            else if (event.data.startsWith("Model:")) {
                const lines = event.data.split(/\r?\n/);
                const modelLine = lines.find(line => line.startsWith("Model:"));
                const serialLine = lines.find(line => line.startsWith("Serial Number:"));

                const model = modelLine ? modelLine.replace("Model:", "").trim() : "unknown model";
                const serial = serialLine ? serialLine.replace("Serial Number:", "").trim() : "unknown serial";

                // Update robot stats box instead of opc-ua-status
                document.getElementById('robot-name-value').textContent = model + " (" + serial + ")";
                document.getElementById('robot-status-value').textContent = 'Connected';

            }
            else if (event.data.startsWith("\ud83d\udd0c Disconnected from ")) {
                const url = event.data.replace("\ud83d\udd0c Disconnected from ", "").trim();
                if (connectedUrl === url) {
                    connectedUrl = null;
                }
                document.getElementById('info-content').innerHTML = `
                <h2>OPC UA Address Space</h2>
                <p>Disconnected from Client</p>`;
                document.getElementById('properties-box').style.display = 'none';
                document.getElementById('info-box').style.width = "450px";
                // Subscriptions-Tabelle leeren
                const subsTable = document.getElementById('subscriptions-table');
                if (subsTable) {
                    const tbody = subsTable.querySelector('tbody');
                    if (tbody) tbody.innerHTML = '';
                }
                // Update robot stats box
                document.getElementById('robot-name-value').textContent = '-';
                document.getElementById('robot-status-value').textContent = 'Not Connected';
                document.getElementById('robot-mode-value').textContent = '-';
                // Toggle-Button zurücksetzen
                const opcUaSyncToggle = document.getElementById('opc-ua-sync-toggle');
                if (opcUaSyncToggle) opcUaSyncToggle.checked = false;
                opcUaSyncEnabled = false;
                opcUaStreamActive = false;
                // Collapse-Button ausblenden
                infoToggleBtn.style.display = "none";
                // Lock-Toggle ausblenden
                hasRoboticsNamespace = null;
                updateRobotLockToggleVisibility();
            }
            else if (event.data.startsWith("❌ No client found")) {
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

// Funktionalität für den Button "Connect" im OPC UA-Bereich
const toggleOpcUa = document.getElementById('toggle-opc-ua');
const opcUaSection = document.getElementById('opc-ua');

toggleOpcUa.addEventListener('click', () => {
    opcUaSection.classList.toggle('hidden');
});

// Funktionalität für den Button "Show Robot Dashboard"
const toggleRobotDashboard = document.getElementById('toggle-robot-dashboard');
const robotDashboardSection = document.getElementById('robot-dashboard');
toggleRobotDashboard.addEventListener('click', () => {
    robotDashboardSection.classList.toggle('hidden');
});

// Button "Connect" – Verbindung zum OPC UA Server und Anzeige des Address Space
const infoToggleBtn = document.getElementById("info-toggle-btn");
infoToggleBtn.style.display = "none";

document.getElementById('connect-opc-ua').addEventListener('click', function () {
    const urlInput = document.getElementById('opc-ua-url');
    const url = urlInput.value.trim();
    console.log(url);

    if (!url) {
        alert('Please enter a valid OPC UA Server URL.');
        return;
    }
    // Entfernt: setInfoBoxState(true); und Breitenanpassung
    // Die Info-Box wird erst nach erfolgreicher Verbindung ausgefahren!

    const message = `connect|${url}`;
    // Entfernt: Info-Box und Button auf expandierten Zustand setzen
    // infoBox.style.width = "750px";
    // propertiesBox.style.width = "750px";
    // infoToggleBtn.textContent = "collapse »";
    // infoBoxExpanded = true;
    // document.getElementById('info-content').style.width = "700px";
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
        // UI-Reset erfolgt jetzt erst nach Serverantwort!
    } else {
        alert("WebSocket is not connected.");
    }
});



function showNodeProperties(element) {
    const propertiesBox = document.getElementById("properties-box");
    const table = document.getElementById("properties-table");

    const dataset = element.dataset;
    table.innerHTML = ""; // vorherige Inhalte löschen

    for (const key in dataset) {
        const row = document.createElement("tr");
        const keyCell = document.createElement("td");
        const valueCell = document.createElement("td");

        keyCell.textContent = key.replace(/([A-Z])/g, ' $1').toUpperCase();

        // Wenn es der Key "value" ist, dann innerHTML verwenden, damit Listen korrekt angezeigt werden
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
    // Fundamental: Prüfe, ob überhaupt ein Client verbunden ist
    if (!connectedUrl) {
        this.checked = false;
        opcUaSyncEnabled = false;
        logMessageToBox('❌ Kein OPC UA Client verbunden. Bitte zuerst verbinden.');
        return;
    }

    if (!hasRoboticsNamespace) {
        this.checked = false;
        opcUaSyncEnabled = false;
        logMessageToBox('❌ Kein OPC UA Robotik Server verbunden.');
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
        // Setze sofort die letzten bekannten Achswerte ins Modell
        if (lastOpcUaAngles && viewer && viewer.angles) {
            const jointNames = Object.keys(viewer.angles);
            const jointValuesRad = {};
            for (const axisName in lastOpcUaAngles) {
                const deg = lastOpcUaAngles[axisName];
                const rad = deg * Math.PI / 180;
                const match = axisName.match(/(\d+)$/);
                if (match) {
                    const idx = parseInt(match[1], 10) - 1;
                    const jointName = jointNames[idx];
                    if (jointName) {
                        // Hier ist deg ggf. aus dem OPC UA, falls du es anzeigen willst:
                        // parseFloat(deg.toFixed(1))
                        jointValuesRad[jointName] = rad;
                    }
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
        // Setze Mode-Feld auf initialen Wert aus HTML ("-")
        const modeField = document.getElementById('robot-mode-value');
        if (modeField) modeField.textContent = '-';
    }
});

const opcUaSyncToggleContainer = document.getElementById('opc-ua-sync-toggle-container');
opcUaSyncToggleContainer.addEventListener('click', function (e) {
    // Prevent event from bubbling to document click handler
    e.stopPropagation();
}, true);

// Event Delegation auf ganze Liste
// Properties-Box soll IMMER beim Klick auf Node erscheinen, egal ob Sync aktiv oder nicht
// (vorher: nur wenn opcUaSyncEnabled)
document.addEventListener("click", function (e) {
    // Wenn auf einen Kontextmenü-Button geklickt wurde, keine Properties-Box-Logik ausführen
    if (e.target.closest('#custom-context-menu')) return;
    // Prüfen, ob auf einen Baumknoten geklickt wurde
    if ((e.target.tagName === "SUMMARY" || e.target.tagName === "SPAN") && e.target.dataset.nodeId) {
        selectedNodeId = e.target.dataset.nodeId;
        console.log("Selected Node ID:", selectedNodeId);
        selectedNodeElement = e.target;
        showNodeProperties(e.target);

        // --- Hier speichern wir die NodeId ---
        if (selectedNodeId) {
            localStorage.setItem('opcuaLastOpenNode', selectedNodeId);
        }

        // --- References-Tabelle aktualisieren ---
        if (selectedNodeId && connectedUrl) {
            const encodedUrl = encodeURIComponent(connectedUrl);
            const encodedNodeId = encodeURIComponent(selectedNodeId);
            fetch(`http://127.0.0.1:8000/references?url=${encodedUrl}&nodeid=${encodedNodeId}`)
                .then(res => res.json())
                .then(refs => {
                    if (Array.isArray(refs)) {
                        // Tabelle im Speicher bauen und dann komplett ersetzen
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
                    console.warn('Fehler beim Laden der References:', err);
                });
        }
    }
});



document.addEventListener("click", async function (e) {
    // Nur für Tree-Summary oder -Span
    if ((e.target.tagName === "SUMMARY" || e.target.tagName === "SPAN") && e.target.dataset.nodeId) {
        const summary = e.target;
        const details = summary.closest("details");
        let ul = details ? details.querySelector("ul") : null;

        // STOPP: Default-Expand verhindern, wenn noch nicht geladen!
        if (details && !details.open && !ul.classList.contains("subtree-loaded")) {
            e.preventDefault(); // Verhindert das sofortige Öffnen

            // Lade erst Children im Hintergrund
            const encodedUrl = encodeURIComponent(connectedUrl);
            const nodeId = encodeURIComponent(summary.dataset.nodeId);
            // (Du kannst hier einen Spinner im summary/ul anzeigen, wenn du willst)
            const resp = await fetch(`http://127.0.0.1:8000/subtree_children?url=${encodedUrl}&nodeid=${nodeId}`);
            const html = await resp.text();

            // Parsen im staging-div
            const staging = document.createElement("div");
            staging.innerHTML = html;
            ul.innerHTML = staging.innerHTML;
            ul.classList.add("subtree-loaded");

            // **Erst jetzt aufklappen!**
            details.open = true;

            // Optionale Properties-Box wie bisher
            selectedNodeId = summary.dataset.nodeId;
            selectedNodeElement = summary;
            showNodeProperties(summary);
            return; // Früh return, um keine doppelten Aktionen zu machen!
        }
        // Ansonsten: Properties anzeigen wie gehabt
        selectedNodeId = summary.dataset.nodeId;
        selectedNodeElement = summary;
        showNodeProperties(summary);
    }

});




// Funktion zum Schließen des Info- und Properties-Box
document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");

        // Aktiven Button wechseln
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        // Inhalte umschalten
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



// Funktionalität für Rechtsklick-Menü



document.addEventListener("contextmenu", function (e) {
    const target = e.target;
    // Nur Kontextmenü für Elemente mit data-nodeid anzeigen
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
    // Prüfen, ob auf einen Baumknoten geklickt wurde
    if ((e.target.tagName === "SUMMARY" || e.target.tagName === "SPAN") && e.target.dataset.nodeId) {
        selectedNodeId = e.target.dataset.nodeId;
        selectedNodeElement = e.target;

        const nodeClass = selectedNodeElement.dataset.nodeclass;

        // Nur für Variable (NodeClass == 2)
        if (nodeClass == "2") {
            // Prüfe, ob es ein Leaf ist (also ein <span>, KEIN <summary>)
            if (e.target.tagName === "SPAN") {
                // Automatisch refreshen, weil es ein Blatt ist
                refreshSelectedNode();
            }
            // Wenn es ein <summary> ist, dann ist es ein expandierbarer Knoten,
            // dort KEIN automatischer Refresh (das regelt das Tree-Lazy-Loading)
        }

        // Optional: Properties-Box wie gehabt anzeigen
        showNodeProperties(e.target);
    }
});



// Aktionen für rechtsklick-Menü
document.getElementById('context-call-method').addEventListener('click', function () {
    const menu = document.getElementById("custom-context-menu");
    menu.style.display = "none";

    if (!selectedNodeId || !selectedNodeElement) {
        alert('❌ Keine Node ausgewählt. (nodeId fehlt)');
        return;
    }

    const nodeClass = selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "4") {
        alert("❌ Diese Node ist keine Methode (NodeClass ≠ 4).");
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
        // Übergebe die aktuelle nodeId explizit an das Popup
        const nodeIdForCall = selectedNodeId;
        showInputParameterPopup(rawValue, (userInputs) => {
            const payload = {
                nodeId: nodeIdForCall,
                inputs: userInputs,
                url: connectedUrl,
            };
            methodStatus.style.display = 'flex';
            spinner.style.display = 'inline-block';
            statusText.textContent = `Methode wird ausgeführt...`;
            socket.send(`call|${JSON.stringify(payload)}`);
        });
    } else {
        methodStatus.style.display = 'flex';
        spinner.style.display = 'inline-block';
        statusText.textContent = `Methode wird ausgeführt...`;
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
        alert('❌ Keine Node ausgewählt. (nodeId fehlt)');
        return;
    }

    const nodeClass = selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "2") {
        alert("❌ Diese Node ist keine Variable (NodeClass ≠ 2).");
        return;
    }
    if (selectedNodeId && connectedUrl) {
        const payload = {
            url: connectedUrl,
            nodeId: selectedNodeId
        };
        socket.send("subscribe|" + JSON.stringify(payload));
        showSubscriptionsTabOnNextCustom = true; // Tab nach erstem Custom-Event aktivieren
    }
});

document.getElementById('context-unsubscribe').addEventListener('click', function () {
    document.getElementById("custom-context-menu").style.display = "none";
    if (!selectedNodeId || !selectedNodeElement) {
        alert('❌ Keine Node ausgewählt. (nodeId fehlt)');
        return;
    }

    const nodeClass = selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "2") {
        alert("❌ Diese Node ist keine Variable (NodeClass ≠ 2).");
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
        alert('❌ Keine Node ausgewählt. (nodeId fehlt)');
        return;
    }

    const nodeClass = selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "1") {
        alert("❌ Diese Node ist kein Objekt (NodeClass ≠ 1).");
        return;
    }
    if (selectedNodeId && connectedUrl) {
        const payload = {
            url: connectedUrl,
            nodeId: selectedNodeId
        };
        socket.send("subscribeEvent|" + JSON.stringify(payload));
        showSubscriptionsTabOnNextCustom = true; // Tab nach erstem Custom-Event aktivieren
    }
});

document.getElementById('context-unsubscribe_event').addEventListener('click', function () {
    document.getElementById("custom-context-menu").style.display = "none";
    if (!selectedNodeId || !selectedNodeElement) {
        alert('❌ Keine Node ausgewählt. (nodeId fehlt)');
        return;
    }

    const nodeClass = selectedNodeElement.dataset.nodeclass;
    if (nodeClass !== "1") {
        alert("❌ Diese Node ist kein Objekt (NodeClass ≠ 1).");
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
    // Sicherstellen, dass ein <ul> Wrapper existiert
    let htmlToParse = rawHtml.trim();
    if (!/^<ul[\s>]/i.test(htmlToParse)) {
        htmlToParse = `<ul>${htmlToParse}</ul>`;
    }
    const container = document.createElement('div');
    container.innerHTML = htmlToParse;
    const items = container.querySelectorAll('li.arg-item');

    // Overlay
    const overlay = document.createElement('div');
    overlay.classList.add('ds-overlay');  // neues, konsistentes Overlay

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

        // Label mit Name, Beschreibung und Typ
        const fieldWrapper = document.createElement('div');
        fieldWrapper.classList.add('ds-form-group');

        const label = document.createElement('label');
        label.classList.add('ds-label');
        label.innerHTML = `<span class="ds-param-name">${name}</span> 
                           <span class="ds-param-desc">(${desc})</span> 
                           <span class="ds-param-type">[${meta}]</span>`;
        fieldWrapper.appendChild(label);

        // Eingabefeld
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

// Schließe das Kontextmenü, wenn außerhalb davon geklickt wird
window.addEventListener('mousedown', function (e) {
    const menu = document.getElementById('custom-context-menu');
    if (menu.style.display === 'block' && !menu.contains(e.target)) {
        menu.style.display = 'none';
    }
});


const infoBox = document.getElementById("info-box");
const propertiesBox = document.getElementById("properties-box");
const toggleBtn = document.getElementById("info-toggle-btn");

// Spiegelung der Breite: Whenever infoBox width changes, set propertiesBox width
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

// Spiegelung bei direkter Änderung der Info-Box-Breite (z.B. durch andere Events)
const observer = new MutationObserver(() => {
    syncInfoPropertiesWidth();
});
observer.observe(infoBox, { attributes: true, attributeFilter: ['style'] });

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
        animToggleBlocker.observe(animToggle, { attributes: true, attributeFilter: ['class'] });
    }
});



window.addEventListener('DOMContentLoaded', () => {
    viewer = document.querySelector('urdf-viewer');
    const animToggle = document.getElementById('do-animate');

    viewer.camera.position.set(-0.5, 1.1, 0.8);


    if (!viewer || !animToggle) {
        console.warn('URDF Viewer nicht gefunden.');
        return;
    }

    viewer.addEventListener('urdf-processed', () => {
        animToggle.classList.remove('checked');

        function updateRevoluteJointStatus() {
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

        // Statusanzeige immer updaten, aber KEINE Mouseup/Call-Logik mehr!
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
        // *** HIER: Nach Drag-Ende GoTo absetzen ***
        viewer.addEventListener('manipulate-end', () => {
            isManipulating = false;
            // Nur senden, wenn OPC UA Sync aktiv ist
            const syncToggle = document.getElementById('opc-ua-sync-toggle');
            if (!syncToggle || !syncToggle.checked) return;

            const r = viewer.robot;
            if (!r || !r.joints) return;

            // Reihenfolge wie bisher (Radiant)
            const jointValuesRad = [];
            for (const name in r.joints) {
                const joint = r.joints[name];
                if (joint.jointType === 'revolute') {
                    let value = Array.isArray(joint.jointValue) ? joint.jointValue[0] : joint.angle;
                    jointValuesRad.push(parseFloat(value.toFixed(6))); // Radiant, 6 Nachkommastellen
                }
            }

            const jointsString = JSON.stringify(jointValuesRad);

            const nodeId = "ns=3;i=20"; // Franka: ns=2;s=Go To, EVA: ns=4;s=Go To, UR5e: ns=3;i=20
            const payload = {
                nodeId: nodeId,
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

            console.log("📤 Sende Go To nach Drag-Ende:", payload);
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(`call|${JSON.stringify(payload)}`);
            }
        });
        // *** ENDE ***
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

    // Hol das aktuellste Element aus dem DOM!
    let el = document.querySelector(`[data-node-id="${selectedNodeId}"]`);
    if (!el) return;

    const nodeClass = el.dataset.nodeclass;
    const li = el.closest('li');
    if (!li) return;

    if (nodeClass == "2") {
        // Prüfe, ob die Variable Kinder hat (ul.subtree-loaded oder ul > li)
        const hasChildren = li.querySelector('ul') && li.querySelector('ul').children.length > 0;
        if (hasChildren) {
            // Wenn Variable Kinder hat, ignoriere den Refresh-Button

            return;
        }
        const encodedUrl = encodeURIComponent(connectedUrl);
        const encodedNodeId = encodeURIComponent(selectedNodeId);
        fetch(`http://127.0.0.1:8000/node_rendered?url=${encodedUrl}&nodeid=${encodedNodeId}&children_depth=1`)
            .then(res => res.text())
            .then(html => {
                // HTML-Fragment parsen
                const staging = document.createElement('div');
                staging.innerHTML = html;
                li.replaceWith(...staging.childNodes);

                // Suche das NEUE Element (nach dem Refresh!)
                const newNode = document.querySelector(`[data-node-id="${selectedNodeId}"]`);
                if (newNode) {
                    selectedNodeElement = newNode; // Update die Referenz!
                    showNodeProperties(newNode);
                }
            });
        return;
    }

    showNodeProperties(el);
}
document.getElementById('refresh-info-box').addEventListener('click', refreshSelectedNode);



// Funktion zum Aktualisieren der References-Tabelle
function updateReferencesTable(refObj, clearFirst = false) {
    const table = document.getElementById("references-table");
    if (!table) return;

    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    // Beim ersten Aufruf: alles löschen
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

// Lock-Toggle initial verstecken
const robotLockToggleContainer = document.getElementById('robot-lock-toggle-container');
if (robotLockToggleContainer) {
    robotLockToggleContainer.style.display = 'none';
}

// Zeige Lock-Toggle nur, wenn hasRoboticsNamespace true ist
function updateRobotLockToggleVisibility() {
    const container = document.getElementById('robot-lock-toggle-container');
    if (!container) return;
    if (hasRoboticsNamespace === true) {
        container.style.display = '';
    } else {
        container.style.display = 'none';
    }
}

// Home-Icon Reset View Funktion
const homeIcon = document.getElementById('home-icon');
if (homeIcon) {
    homeIcon.addEventListener('click', () => {
        const viewer = document.querySelector('urdf-viewer');
        if (viewer && viewer.camera) {
            
            viewer.dispatchEvent(new Event('reset-angles'));
            
            
        }
    });
}







