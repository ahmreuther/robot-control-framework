/* globals */
import * as THREE from 'three';
import { registerDragEvents } from './dragAndDrop.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import URDFIKManipulator from './URDFIKManipulator.js'
import Stats from 'three/examples/jsm/libs/stats.module.js';

import { addRobot, removeRobot, getRobot, listRobots, setStatusListener, getNextSlotIndex, setManipulatorFactory, getActiveRobot, setActiveRobot} from './robotManager.js';
import { spawnRobot, disposeRobotNode, renderForAFewFrames } from './sceneManager.js';
import {
    handleSocketMessage,
    toggleOpcUaSection,
    toggleRobotDashboardSection,
    connectOpcUa,
    disconnectOpcUa,
    handleOpcUaSyncToggle,
    handleOpcUaNodeSelection,
    handleSubtreeClick,
    switchTab,
    logMessageToBox,
    clearLog,

    handleNodeClick,
    handleGlobalMouseDown,

    handleContextMenu,
    handleContextCallMethod,
    handleContextSubscribe,
    handleContextUnsubscribe,
    handleContextSubscribeEvent,

    syncWidth,
    initWidthObserver,
    initAnimationBlocker,
    getToggleDimensions,
    handleManipulateEnd,
    updateRevoluteJointStatus,
    refreshSelectedNode,
    handleHomeClick,
    toggleMcpIntegration,
    sendMcpRobotStateUpdate,
    updateConnectionStatus
} from './functionalities.js';

customElements.define('urdf-viewer', URDFIKManipulator);

// declare these globally for the sake of the example.
// Hack to make the build work with webpack for now.
// TODO: Remove this once modules or parcel is being used
const viewer = document.querySelector('urdf-viewer');
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
const animToggle = document.getElementById('do-animate');
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


let globalSocket = null;

function initGlobalSocket() {
    globalSocket = new WebSocket("ws://127.0.0.1:8000/ws");

    globalSocket.onopen = () => {
        console.log("WebSocket connection established.");
        globalSocket.send("status");
    };
    globalSocket.onmessage = (event) => {
        const activeRobot = getActiveRobot();
        
        // Safety Check: Only process if a robot actually exists
        if (activeRobot) {
            handleSocketMessage(activeRobot, event);
        } else {
            console.warn("Socket message received, but no active robot found to process it.");
        }
    }

    globalSocket.onerror = (error) => {
        console.error("WebSocket error:", error);
    };

    globalSocket.onclose = () => {
        console.log("WebSocket connection closed.");
    };
}
initGlobalSocket();

// renderForAFewFrames is provided by `services/sceneManager.js`

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
import { robotModels } from './robotManager.js';

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

    // pass robot for IK and rig so gizmo is parented correctly
    record.manipulator.setRobot(robot, record.id, rig);
    record.manipulator.addEventListener('manipulate-start', () => {
        setActiveRobot(record.id);
        activeRobotSelect.value = record.id; 
        ControlCenterSliders();              
    });

    addRobotOption(record.id, model.name);
    setActiveRobot(record.id);
    activeRobotSelect.value = record.id;
    ControlCenterSliders();

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
    
    if (record && record.sceneNode) {
        if (record.sceneNode.parent) record.sceneNode.parent.remove(record.sceneNode);
        disposeRobotNode(record.sceneNode);
    }
    renderForAFewFrames(viewer);

    await removeRobot(record.id);
    ControlCenterSliders();

    // remove from dropdown
    const option = activeRobotSelect.querySelector(`option[value="${record.id}"]`);
    if (option) option.remove();

    // select new robot if available
    if (activeRobotSelect.options.length > 0) {
        setActiveRobot(activeRobotSelect.options[0].value);
        activeRobotSelect.value = activeRobotSelect.options[0].value;
    } else {
        setActiveRobot(null);
    }
    activeRobotSelect.value = getActiveRobot();

    robotCountValue.textContent = listRobots().length;
});

activeRobotSelect.addEventListener('change', () => {
    const selectedId = activeRobotSelect.value;
    setActiveRobot(selectedId);

    const record = getActiveRobot();
    const urlInput = document.getElementById('opcua-url');
    if (record) {
        const isConnected = (record.state.connectivity.status === 'connected');
        updateConnectionStatus(record, isConnected);

        const urlInput = document.getElementById('opcua-url');
        if (urlInput) {
            urlInput.value = record.state.connectivity.connectedUrl || "";
        }
    }
    ControlCenterSliders();
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


viewer.addEventListener('urdf-change', () => {
    Object.values(controlSliders).forEach(sl => sl.remove());
    controlSliders = {};

});

viewer.addEventListener('ignore-limits-change', () => {
    Object.values(controlSliders).forEach(sl => sl.update());
});


viewer.addEventListener('angle-change', e => {
    if (e && e.detail && controlSliders[e.detail]) {
        controlSliders[e.detail].update();
    } else {
        Object.values(controlSliders).forEach(sl => sl.update());
    }
});


viewer.addEventListener('joint-mouseover', e => {

    const j = document.querySelector(`li[joint-name="${e.detail}"]`);
    if (j) j.setAttribute('robot-hovered', true);

});

viewer.addEventListener('joint-mouseout', e => {

    const j = document.querySelector(`li[joint-name="${e.detail}"]`);
    if (j) j.removeAttribute('robot-hovered');

});

let originalNoAutoRecenter;
viewer.addEventListener('manipulate-start', e => {

    const j = document.querySelector(`li[joint-name="${e.detail}"]`);
    if (j) {
        j.scrollIntoView({ block: 'nearest' });
        window.scrollTo(0, 0);
    }

    originalNoAutoRecenter = viewer.noAutoRecenter;
    viewer.noAutoRecenter = true;

});

viewer.addEventListener('manipulate-end', e => {
    viewer.noAutoRecenter = originalNoAutoRecenter;
});

// create the sliders for the currently active robot
viewer.addEventListener('urdf-processed', () => {
    ControlCenterSliders();
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

    animToggle.classList.add('checked');
    setColor(color);
    //adding initial robot
    const model = robotModels[0]; //eva robot
    addRobotByModel(model);
    
    if (/javascript\/example\/bundle/i.test(window.location)) {
        viewer.package = '../../../urdf';
    }

    registerDragEvents(viewer, () => {
        setColor('#263238');
        animToggle.classList.remove('checked');
        updateList();
    });

});

const updateAngles = () => {
    const robots = listRobots();
    if (robots.length === 0) return;

    const time = Date.now() / 3e2;

    robots.forEach(record => {
        const manipulator = record.manipulator;
        if (record.model === 'EVA') {
            const time = Date.now() / 3e2;
            for (let i = 1; i <= 6; i++) {
                const offset = i * Math.PI / 3;
                const ratio = Math.max(0, Math.sin(time + offset));
                manipulator.setJointValue(`HP${i}`, THREE.MathUtils.lerp(30, 0, ratio) * DEG2RAD);
                manipulator.setJointValue(`KP${i}`, THREE.MathUtils.lerp(90, 150, ratio) * DEG2RAD);
                manipulator.setJointValue(`AP${i}`, THREE.MathUtils.lerp(-30, -60, ratio) * DEG2RAD);
                manipulator.setJointValue(`TC${i}A`, THREE.MathUtils.lerp(0, 0.065, ratio));
                manipulator.setJointValue(`TC${i}B`, THREE.MathUtils.lerp(0, 0.065, ratio));
                manipulator.setJointValue(`W${i}`, window.performance.now() * 0.001);
            }
        }
    });
};

const updateLoop = () => {

    if (animToggle.classList.contains('checked')) {
        updateAngles();
    }

    requestAnimationFrame(updateLoop);

};

document.addEventListener('WebComponentsReady', () => {

    animToggle.addEventListener('click', () => animToggle.classList.toggle('checked'));

    // stop the animation if user tried to manipulate the model
    viewer.addEventListener('manipulate-start', e => animToggle.classList.remove('checked'));
    viewer.addEventListener('urdf-processed', e => updateAngles());
    updateLoop();
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
    const robot = manipulator?.robot || viewer?.robot;
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

            if (joint.jointType === 'fixed') return;
            if (joint.jointType === 'prismatic' && Array.isArray(joint.mimicJoints) && joint.mimicJoints.length === 0) return;

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
                const current = (manipulator?.robot || viewer?.robot)?.joints?.[jointName];
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

            slider.addEventListener('input', () => {
                const value = parseFloat(slider.value);
                if (manipulator?.setJointValue) {
                    manipulator.setJointValue(jointName, value);
                } else if (viewer?.setJointValue) {
                    viewer.setJointValue(jointName, value);
                }
                li.update();
            });

            input.addEventListener('change', () => {
                const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : DEG2RAD;
                const value = parseFloat(input.value) * degMultiplier;
                if (manipulator?.setJointValue) {
                    manipulator.setJointValue(jointName, value);
                } else if (viewer?.setJointValue) {
                    viewer.setJointValue(jointName, value);
                }
                li.update();
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
//const animToggle = document.getElementById('do-animate');

// Internal State

// 1. Initial Setup
syncWidth(infoBox, propertiesBox);
initWidthObserver(infoBox, propertiesBox);
initAnimationBlocker(animToggle);

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

window.addEventListener('DOMContentLoaded', () => {
    const robot = getActiveRobot();
    const animToggle = document.getElementById('do-animate');

    if (!robot || !robot.manipulator|| !animToggle) {
            console.warn('URDF Manipulator not found.');
            return;
        };
    const manipulator = robot.manipulator;

    manipulator.addEventListener('urdf-processed', () => {
        manipulator.camera.position.set(-0.5, 1.1, 0.8);

        animToggle.classList.remove('checked');
        animToggle.remove(animToggle);

        
        updateRevoluteJointStatus(robot);

        manipulator.addEventListener('angle-change', updateRevoluteJointStatus);

        document.getElementById('radians-toggle')?.addEventListener('click', () => {
            setTimeout(() => { updateRevoluteJointStatus(robot); }, 0);
        });

        manipulator.addEventListener('manipulate-start', () => {
            robot.state.interaction.isManipulating = true;
        });
        manipulator.addEventListener('manipulate-end', () => {
            handleManipulateEnd(robot);
        });


    });
});
/*
window.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('opc-ua-url');
    const lastUrl = localStorage.getItem('lastOpcUaUrl');
    if (lastUrl && urlInput) {
        urlInput.value = lastUrl;
    }
});*/

document.getElementById('refresh-info-box').addEventListener('click', () =>{
    refreshSelectedNode();
});

document.getElementById('home-icon').addEventListener('click', () => {
    handleHomeClick(getActiveRobot());
});

document.getElementById('mcp-integration-toggle').addEventListener('click', (e) => {
    toggleMcpIntegration(getActiveRobot(), e);
});

document.addEventListener('DOMContentLoaded', () => {
    const robot = getActiveRobot();
    if(robot){
        manipulator.addEventListener('angle-change', () => {
            sendMcpRobotStateUpdate(getActiveRobot());
        });
    }
});


window.addEventListener('load', () => {
    // Enable Hide Fixed Joints when loading
    const hideFixedToggle = document.getElementById('hide-fixed');
    hideFixedToggle.dispatchEvent(new Event('click'));
});
