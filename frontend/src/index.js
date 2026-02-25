/* globals */
import * as THREE from 'three';
import { registerDragEvents } from './dragAndDrop.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import URDFIKManipulator from './URDFIKManipulator.js'
import Stats from 'three/examples/jsm/libs/stats.module.js';

import { robotModels, addRobot, removeRobot, getRobot, listRobots, setStatusListener, getNextSlotIndex, 
    setManipulatorFactory, getActiveRobot, setActiveRobot, setGlobalSocket} from './robot/robotManager.js';

import { spawnRobot, disposeRobotNode } from './scene/sceneManager.js';
/*
import {
    toggleMcpIntegration,
    sendMcpRobotStateUpdate
} from './functionalities.js';

import {
    toggleOpcUaSection,
    toggleRobotDashboardSection,
    switchTab,
    handleNodeClick,
    refreshSelectedNode,
    handleContextMenu,
    handleGlobalMouseDown,
    handleContextCallMethod,
    handleContextSubscribe,
    handleContextUnsubscribe,
    handleContextSubscribeEvent,
    handleContextUnsubscribeEvent,
    logMessageToBox,
    clearLog,
    syncWidth,
    initWidthObserver,
    getToggleDimensions
} from './functionalities.js';

import {
    handleSocketMessage,
    connectOpcUa,
    disconnectOpcUa,
    handleOpcUaSyncToggle,
    handleOpcUaNodeSelection,
    handleSubtreeClick,
    updateRevoluteJointStatus,
    handleManipulateEnd,
    handleHomeClick,
    updateRobotSpecificUI
} from './functionalities.js';
*/
import { handleOpcUaNodeSelection, handleSubtreeClick, refreshSelectedNode } from './opcua/addressSpace';
import { connectOpcUa, disconnectOpcUa, handleSocketMessage, handleOpcUaSyncToggle } from './opcua/connection.js';
import { handleContextMenu, handleNodeClick, handleContextCallMethod, handleContextSubscribe,
    handleContextUnsubscribe, handleContextSubscribeEvent, handleContextUnsubscribeEvent, handleGlobalMouseDown } from './opcua/contextMenu.js';
import { toggleMcpIntegration, sendMcpRobotStateUpdate } from './robot/mcp.js';
import { toggleOpcUaSection,toggleRobotDashboardSection, switchTab, syncWidth, initWidthObserver, 
    initAnimationBlocker, getToggleDimensions } from './ui/layout.js';
import { logMessageToBox, clearLog } from './ui/logging.js';
import { updateRevoluteJointStatus, handleManipulateEnd, handleHomeClick, updateRobotSpecificUI } from './ui/robotUiState.js';

customElements.define('urdf-viewer', URDFIKManipulator);

// Global keyboard handler for the active robot
window.addEventListener('keydown', (e) => {
    // Dispatch key events only to the currently active robot's manipulator
    const activeRecord = getActiveRobot();
    if (activeRecord && activeRecord.manipulator && typeof activeRecord.manipulator.handleKey === 'function') {
        activeRecord.manipulator.handleKey(e.key);
    }
});

// declare these globally for the sake of the example.
// Hack to make the build work with webpack for now.
// TODO: Remove this once modules or parcel is being used
const viewer = document.querySelector('urdf-viewer');
viewer.ignoreKeys = true;

setupMiniStats(viewer);

// Provide a global manipulator factory once so addRobot can reuse it.
setManipulatorFactory(() => {
    if (!viewer) return null;
    const manipulator = new URDFIKManipulator({
        scene: viewer.scene,
        world: viewer.world,
        camera: viewer.camera,
        renderer: viewer.renderer,
        controls: viewer.controls,
        requestRender: () => {
            if (typeof viewer.redraw === 'function') {
                viewer.redraw();
            } else if (viewer.renderer && viewer.scene && viewer.camera) {
                viewer.renderer.render(viewer.scene, viewer.camera);
            }
        }
    });
    
    return manipulator;
});

const limitsToggle = document.getElementById('ignore-joint-limits');
const collisionToggle = document.getElementById('collision-toggle');
const radiansToggle = document.getElementById('radians-toggle');
const autocenterToggle = document.getElementById('autocenter-toggle');
const upSelect = document.getElementById('up-select');
const sliderList = document.querySelector('#controls ul');
const controlsel = document.getElementById('controls');
const controlsToggle = document.getElementById('toggle-controls');
const hideFixedToggle = document.getElementById('hide-fixed');
const ikMove = document.getElementById('ik-move');
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 1 / DEG2RAD;
let controlSliders = {};

// Multi-Robot
const multiRobotModelSelect = document.getElementById('multi-robot-model');
const addRobotBtn = document.getElementById('add-robot-btn');
const activeRobotSelect = document.getElementById('active-robot-select');
const deleteRobotBtn = document.getElementById('delete-robot-btn');
const robotCountValue = document.getElementById('robot-count-value');

let originalNoAutoRecenter = null;

let globalSocket = null;

function initGlobalSocket() {
    globalSocket = new WebSocket("ws://127.0.0.1:8000/ws");
    setGlobalSocket(globalSocket);

    globalSocket.onopen = () => {
        console.log("WebSocket connection established.");
        globalSocket.send("status");
    };
    globalSocket.onmessage = (event) => {
        handleSocketMessage(event);
    }

    globalSocket.onerror = (error) => {
        console.error("WebSocket error:", error);
    };

    globalSocket.onclose = () => {
        console.log("WebSocket connection closed.");
    };
}
initGlobalSocket();

function setupMiniStats(viewerEl) {
  const container = document.getElementById('stats-output');
  if (!container) return;
  const stats = new Stats();
  stats.dom.style.position = 'relative';
  stats.dom.style.top = 'auto';
  stats.dom.style.left = 'auto';
  stats.dom.style.margin = '6px 0';
  container.appendChild(stats.dom);
  stats.showPanel(0);
  stats.dom.title = 'Klicken: FPS → MS → RAM';
  (function loop() {
    stats.update();
    requestAnimationFrame(loop);
  })();
}

const params = {
    solve: true,
    displayMesh: true,
    displayIk: true,
    displayGoals: true,
    displayShadows: true,
    model: 'EVA',
    webworker: true,
};

const solverOptions = {
    useSVD: false,
    maxIterations: 3,
    divergeThreshold: 0.05,
    stallThreshold: 1e-4,
    translationErrorClamp: 0.25,
    rotationErrorClamp: 0.25,
    translationConvergeThreshold: 1e-3,
    rotationConvergeThreshold: 1e-5,
    restPoseFactor: 0.025,
};

// Multi- Robot
const addRobotSelect = document.getElementById('multi-robot-model');
robotModels.forEach(r => {
    const option = document.createElement('option');
    option.value = r.name;
    option.textContent = r.name;
    multiRobotModelSelect.appendChild(option);
});

function addRobotOption(id, name) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${name} (${id})`;
    activeRobotSelect.appendChild(opt);
}
//TODO
function switchRobot(robotId){
    setActiveRobot(robotId);
    const record = getActiveRobot();
    activeRobotSelect.value = robotId; 
    ControlCenterSliders(); 
    updateRobotSpecificUI(record);
}

async function addRobotByModel(model) {
    const slotIndex = getNextSlotIndex();
    const record = await addRobot({
        model: model.name,
        urdfPath: model.urdf,
        sceneNode: null,
        slotIndex
    });
    // fixed v1.1
    const spawned = await spawnRobot(viewer, {urdfPath: model.urdf, slotIndex, getNextSlotIndex});
    if (!spawned) return;

    const {rig, robot} = spawned;

    // store rig (so delete removes the whole robot space)
    record.sceneNode = rig;
    rig.updateMatrixWorld(true);

    if (globalSocket) {
        record.state.connectivity.socket = globalSocket;
    }
    const manipulator = record.manipulator;

    // pass robot for IK and rig so gizmo is parented correctly
    manipulator.setRobot(robot, record.id, rig);

    // create the sliders for the currently active robot
    manipulator.addEventListener('urdf-processed', () => {
        viewer.camera.position.set(-0.5, 1.1, 0.8);
        ControlCenterSliders();
        updateRevoluteJointStatus(record);

    });

    manipulator.addEventListener('angle-change', (e) => {
        if (e && e.detail && controlSliders[e.detail]) {
            controlSliders[e.detail].update();
        } else {
            Object.values(controlSliders).forEach(sl => sl.update());
        }
        updateRevoluteJointStatus(record);

        sendMcpRobotStateUpdate(record);
    });

    manipulator.addEventListener('manipulate-start', (e) => {
        switchRobot(record.id);
        
        const j = document.querySelector(`li[joint-name="${e.detail}"]`);
        if (j) {
            j.scrollIntoView({ block: 'nearest' });
            window.scrollTo(0, 0);
        }

        originalNoAutoRecenter = viewer.noAutoRecenter;
        viewer.noAutoRecenter = true;

        record.state.interaction.isManipulating = true;
    });

    manipulator.addEventListener('manipulate-end', e => {
        viewer.noAutoRecenter = originalNoAutoRecenter;
        record.state.interaction.isManipulating = false;
        handleManipulateEnd(record)
    });
    //hover effect i think
    manipulator.addEventListener('joint-mouseover', e => {

        const j = document.querySelector(`li[joint-name="${e.detail}"]`);
        if (j) j.setAttribute('robot-hovered', true);

    });

    manipulator.addEventListener('joint-mouseout', e => {

        const j = document.querySelector(`li[joint-name="${e.detail}"]`);
        if (j) j.removeAttribute('robot-hovered');

    });
    addRobotOption(record.id, model.name);
    switchRobot(record.id);

    robotCountValue.textContent = listRobots().length;
}
// spawnRobot handled by `services/sceneManager.js`

// disposeRobotNode handled by `services/sceneManager.js`


addRobotBtn.addEventListener('click', async () => {
    try {
        const selectedName = addRobotSelect.value;
        if (!selectedName) return;
        
        const model = robotModels.find(m => m.name === selectedName);
        if (!model) return;
        addRobotByModel(model);
        
    } catch (err) {
        console.error('Failed to add robot', err);
        logMessageToBox('Failed to add robot: ' + (err?.message || err));
    }
});

deleteRobotBtn.addEventListener('click', async () => {
    const record = getActiveRobot();

    if (!record) return;

    // Prevent deletion if connected
    if (record.state.connectivity.connectedUrl) {
        alert("Cannot delete robot while connected to OPC UA server. Please disconnect first.");
        return;
    }
    
    if (record && record.sceneNode) {
        if (record.sceneNode.parent) record.sceneNode.parent.remove(record.sceneNode);
        disposeRobotNode(record.sceneNode);
    }

    await removeRobot(record.id);
    ControlCenterSliders();

    // remove from dropdown
    const option = activeRobotSelect.querySelector(`option[value="${record.id}"]`);
    if (option) option.remove();

    // select new robot if available
    if (activeRobotSelect.options.length > 0) {
        switchRobot(activeRobotSelect.options[0].value);
    } else {
        switchRobot(null);
    }

    robotCountValue.textContent = listRobots().length;
});

activeRobotSelect.addEventListener('change', () => {
    switchRobot(activeRobotSelect.value);
});

// Global Functions
const setColor = color => {

    document.body.style.backgroundColor = color;
    viewer.highlightColor = '#' + (new THREE.Color(0xffffff)).lerp(new THREE.Color(color), 0.35).getHexString();

};


limitsToggle.addEventListener('click', () => {
    limitsToggle.classList.toggle('checked');
    viewer.ignoreLimits = limitsToggle.classList.contains('checked');
});

radiansToggle.addEventListener('click', () => {
    radiansToggle.classList.toggle('checked');
    Object
    .values(controlSliders)
        .forEach(sl => sl.update());
});

collisionToggle.addEventListener('click', () => {
    collisionToggle.classList.toggle('checked');
    viewer.showCollision = collisionToggle.classList.contains('checked');
    viewer.redraw();
});

autocenterToggle.addEventListener('click', () => {
    autocenterToggle.classList.toggle('checked');

    viewer.noAutoRecenter = !autocenterToggle.classList.contains('checked');
});

hideFixedToggle.addEventListener('click', () => {
    hideFixedToggle.classList.toggle('checked');

    const hideFixed = hideFixedToggle.classList.contains('checked');
    if (hideFixed) controlsel.classList.add('hide-fixed');
    else controlsel.classList.remove('hide-fixed');

});

upSelect.addEventListener('change', () => viewer.up = upSelect.value);

controlsToggle.addEventListener('click', () => controlsel.classList.toggle('hidden'));

// not in addRobotByModel because it is global and for all UI (i think)
viewer.addEventListener('ignore-limits-change', () => {
    Object.values(controlSliders).forEach(sl => sl.update());
});


document.addEventListener('WebComponentsReady', () => {

    viewer.loadMeshFunc = (path, manager, done) => {
        const ext = path.split(/\./g).pop().toLowerCase();
        switch (ext) {

            case 'gltf':
            case 'glb':
                new GLTFLoader(manager).load(
                    path,
                    result => done(result.scene),
                    null,
                    err => done(null, err),
                );
                break;
            case 'obj':
                new OBJLoader(manager).load(
                    path,
                    result => done(result),
                    null,
                    err => done(null, err),
                );
                break;
            case 'dae':
                new ColladaLoader(manager).load(
                    path,
                    result => done(result.scene),
                    null,
                    err => done(null, err),
                );
                break;
            case 'stl':
                new STLLoader(manager).load(
                    path,
                    result => {
                        const material = new THREE.MeshPhongMaterial();
                        const mesh = new THREE.Mesh(result, material);
                        done(mesh);
                    },
                    null,
                    err => done(null, err),
                );
                break;

        }

    };
    //uses the eva model for color etc.
    //maybe change it for more robust color

    const color = "#546575";
    viewer.up = '+Z';
    document.getElementById('up-select').value = viewer.up;//what does this do?

    setColor(color);
    //adding initial robot
    const model = robotModels[0]; //eva robot
    addRobotByModel(model);
    
    if (/javascript\/example\/bundle/i.test(window.location)) {
        viewer.package = '../../../urdf';
    }
    /* // currently not working because it would need to be per robot and use the robotmanager. TODO
    registerDragEvents(viewer, () => {
        setColor('#263238');
        animToggle.classList.remove('checked');
        updateList();
    });
    */
});


document.addEventListener('WebComponentsReady', () => {

    //viewer.camera.position.set(-1.5, 3.5, 5.5);
    viewer.camera.position.set(-1.5, 1.5, 1.5);
    autocenterToggle.classList.remove('checked');
    viewer.noAutoRecenter = true;
});


// ===== Robot Control Center Functions =====
function ControlCenterSliders() {
    // Clear existing sliders
    Object.values(controlSliders).forEach(li => li.remove());
    controlSliders = {};

    const record = getActiveRobot();
    const manipulator = record?.manipulator;
    const robot = manipulator?.robot;
    if (!robot || !robot.joints) return;

    Object.keys(robot.joints)
        .sort((a, b) => {
            const da = a.split(/[^\d]+/g).filter(v => !!v).pop();
            const db = b.split(/[^\d]+/g).filter(v => !!v).pop();
            if (da !== undefined && db !== undefined) {
                const delta = parseFloat(da) - parseFloat(db);
                if (delta !== 0) return delta;
            }
            if (a > b) return 1;
            if (b > a) return -1;
            return 0;
        })
        .forEach(jointName => {
            const joint = robot.joints[jointName];

            // if (joint.jointType === 'fixed') return;
            if (joint.jointType === 'prismatic' && 
                Array.isArray(joint.mimicJoints) && 
                joint.mimicJoints.length === 0
            ) return;

            const li = document.createElement('li');
            li.innerHTML = `
                <span title="${jointName}">${jointName}</span>
                <input type="range" value="0" step="0.0001"/>
                <input type="number" step="0.0001" />
            `;
            li.setAttribute('joint-type', joint.jointType);
            li.setAttribute('joint-name', jointName);

            sliderList.appendChild(li);

            const slider = li.querySelector('input[type="range"]');
            const input = li.querySelector('input[type="number"]');

            li.update = () => {
                const current = (manipulator?.robot)?.joints?.[jointName];
                if (!current) return;

                const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : RAD2DEG;
                let angle = current.angle;

                if (current.jointType === 'revolute' || current.jointType === 'continuous') {
                    angle *= degMultiplier;
                }

                if (Math.abs(angle) > 1) {
                    angle = angle.toFixed(1);
                } else {
                    angle = angle.toPrecision(2);
                }

                input.value = parseFloat(angle);
                slider.value = current.angle;

                if (viewer.ignoreLimits || current.jointType === 'continuous') {
                    slider.min = -6.28;
                    slider.max = 6.28;
                    input.min = -6.28 * degMultiplier;
                    input.max = 6.28 * degMultiplier;
                } else if (current.limit) {
                    slider.min = current.limit.lower;
                    slider.max = current.limit.upper;
                    input.min = current.limit.lower * degMultiplier;
                    input.max = current.limit.upper * degMultiplier;
                }
            };

            switch (joint.jointType) {
                case 'continuous':
                case 'prismatic':
                case 'revolute':
                    break;
                default:
                    li.update = () => { };
                    input.remove();
                    slider.remove();
            }
            // Helpers
            const startManipulating = () => {
                record.state.interaction.isManipulating = true;
            };

            const stopManipulating = () => {
                record.state.interaction.isManipulating = false;
                handleManipulateEnd(record);
                li.update();
            };

            const applyJointValue = (value) => {
                if (manipulator?.setJointValue) {
                    manipulator.setJointValue(jointName, value);
                }
                li.update();
            };

            
            slider.addEventListener('input', () => {
                startManipulating();
                applyJointValue(parseFloat(slider.value));
            });

            // End manipulation reliably
            slider.addEventListener('pointerup', stopManipulating);
            slider.addEventListener('touchend', stopManipulating);
            slider.addEventListener('change', stopManipulating); // fallback

            input.addEventListener('change', () => {
                const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : DEG2RAD;
                const value = parseFloat(input.value) * degMultiplier;

                startManipulating();
                applyJointValue(value);
                stopManipulating();
            });

            li.update();
            controlSliders[jointName] = li;
        });

    // Attach a single angle-change listener per manipulator to keep sliders in sync
    if (manipulator && !record?._controlCenterListenerAttached) {
        manipulator.addEventListener('angle-change', (e) => {
            const j = e?.detail;
            if (j && controlSliders[j]) {
                controlSliders[j].update();
            } else {
                Object.values(controlSliders).forEach(li => li.update());
            }
        });
        if (record) record._controlCenterListenerAttached = true;
    }
}

    
toggleRobotDashboardSection();
toggleOpcUaSection();
document.getElementById('connect-opc-ua').addEventListener('click', () => {
    connectOpcUa(getActiveRobot());
});

document.getElementById('disconnect-opc-ua').addEventListener('click', () => {
    disconnectOpcUa(getActiveRobot());
});
const opcUaSyncToggle = document.getElementById('opc-ua-sync-toggle');
opcUaSyncToggle.addEventListener('change', (e) => {
    handleOpcUaSyncToggle(getActiveRobot(), e);
});

const opcUaSyncToggleContainer = document.getElementById('opc-ua-sync-toggle-container');
opcUaSyncToggleContainer.addEventListener('click', (e) => {
    e.stopPropagation();
}, true);

document.addEventListener("click", (e) => {
    handleOpcUaNodeSelection(getActiveRobot(), e);
});

document.addEventListener("click", async (e) => {
        handleSubtreeClick(getActiveRobot(), e);
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        const tabName = btn.getAttribute("data-tab");
        switchTab(tabName);
    });
});

document.getElementById('clear-log-btn').addEventListener('click', () => {
    clearLog();
});

document.addEventListener("contextmenu", (e) => {
    handleContextMenu(getActiveRobot(), e);
});

document.addEventListener("click", (e) => {
    handleNodeClick(getActiveRobot(), e);
});

document.getElementById('context-call-method').addEventListener('click', () => {
    handleContextCallMethod(getActiveRobot());
});

document.getElementById('context-subscribe').addEventListener('click', () => {
    handleContextSubscribe(getActiveRobot());
});

document.getElementById('context-unsubscribe').addEventListener('click', () => {
    handleContextUnsubscribe(getActiveRobot());
});

document.getElementById('context-subscribe_event').addEventListener('click', () => {
    handleContextSubscribeEvent(getActiveRobot());
});
document.getElementById('context-unsubscribe_event').addEventListener('click', () => {
    handleContextUnsubscribeEvent(getActiveRobot());
});

window.addEventListener('mousedown', (e) => {
    handleGlobalMouseDown(e);
});

// DOM Elements
const infoBox = document.getElementById("info-box");
const propertiesBox = document.getElementById("properties-box");
const toggleBtn = document.getElementById("info-toggle-btn");
//already defined

// Internal State

// 1. Initial Setup
syncWidth(infoBox, propertiesBox);
initWidthObserver(infoBox, propertiesBox);

let infoBoxExpanded = true;

toggleBtn?.addEventListener("click", () => {
    const { width, label } = getToggleDimensions(infoBoxExpanded);
    
    // Apply changes
    infoBox.style.width = width;
    propertiesBox.style.width = width;
    toggleBtn.textContent = label;
    
    // Update state
    infoBoxExpanded = !infoBoxExpanded;
});

// have last connect url in opcua url box
/* // this is not really needed/good if we want multiple robots. is currently overridde by updateRobotSpecificUI
window.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('opc-ua-url');
    const lastUrl = localStorage.getItem('lastOpcUaUrl');
    if (lastUrl && urlInput) {
        urlInput.value = lastUrl;
    }
});
*/

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('radians-toggle')?.addEventListener('click', () => {
        setTimeout(() => { updateRevoluteJointStatus(robot); }, 0);
    });
});
document.getElementById('refresh-info-box').addEventListener('click', () =>{
    refreshSelectedNode();
});

document.getElementById('home-icon').addEventListener('click', () => {
    handleHomeClick(getActiveRobot());
});

document.getElementById('mcp-integration-toggle').addEventListener('click', (e) => {
    toggleMcpIntegration(getActiveRobot(), e);
});


window.addEventListener('load', () => {
    // Enable Hide Fixed Joints when loading
    const hideFixedToggle = document.getElementById('hide-fixed');
    hideFixedToggle.dispatchEvent(new Event('click'));
});


