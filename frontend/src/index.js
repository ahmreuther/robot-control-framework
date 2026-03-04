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

import { handleOpcUaNodeSelection, handleSubtreeClick, refreshSelectedNode } from './opcua/addressSpace';
import { connectOpcUa, disconnectOpcUa, handleSocketMessage, handleOpcUaSyncToggle } from './opcua/connection.js';
import { handleContextMenu, handleNodeClick, handleContextCallMethod, handleContextSubscribe,
    handleContextUnsubscribe, handleContextSubscribeEvent, handleContextUnsubscribeEvent, handleGlobalMouseDown } from './opcua/contextMenu.js';
import { toggleMcpIntegration, sendMcpRobotStateUpdate } from './robot/mcp.js';
import { toggleOpcUaSection,toggleRobotDashboardSection, switchTab, syncWidth, initWidthObserver, 
    initAnimationBlocker, getToggleDimensions } from './ui/layout.js';
import { logMessageToBox, clearLog } from './ui/logging.js';
import { updateRevoluteJointStatus, handleManipulateEnd, handleHomeClick, updateRobotSpecificUI } from './ui/robotUiState.js';

/**
Future development notes:
- `switchRobot` only rebuilds sliders when the active robot changes to avoid resetting inputs.
- Active robot toggling is centralized via `setActiveState` so only one IK gizmo is live.
- If you add new per-robot UI, hook it in `switchRobot` and `addRobotByModel`.
*/

/**
 * Register the custom element once for all robots.
 */
customElements.define('urdf-viewer', URDFIKManipulator);

/**
 * Send keyboard input to the active robot only.
 * @param {KeyboardEvent} e - Keyboard event.
 */
window.addEventListener('keydown', (e) => {
    const activeRecord = getActiveRobot();
    if (activeRecord && activeRecord.manipulator && typeof activeRecord.manipulator.handleKey === 'function') {
        activeRecord.manipulator.handleKey(e.key);
    }
});

/**
 * Use a single viewer instance to keep legacy bundling behavior.
 */
const viewer = document.querySelector('urdf-viewer');
viewer.ignoreKeys = true;

setupMiniStats(viewer);

/**
 * Build manipulators that reuse the viewer's shared resources.
 * @returns {URDFIKManipulator|null}
 */
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

/**
 * Cache shared UI elements.
 */
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

/**
 * Multi-robot controls.
 */
const multiRobotModelSelect = document.getElementById('multi-robot-model');
const addRobotBtn = document.getElementById('add-robot-btn');
const activeRobotSelect = document.getElementById('active-robot-select');
const deleteRobotBtn = document.getElementById('delete-robot-btn');
const robotCountValue = document.getElementById('robot-count-value');

let originalNoAutoRecenter = null;
let lastFocusedRobotId = null;

/**
 * One WebSocket shared across robots.
 */
let globalSocket = null;

/**
 * Initialize a single shared OPC UA WebSocket for all robots.
 */
function initGlobalSocket() {
    globalSocket = new WebSocket("ws://127.0.0.1:8000/ws");
    setGlobalSocket(globalSocket);

    globalSocket.onopen = () => {
        console.log("[Global] WebSocket connection established.");
        globalSocket.send("status");
    };
    globalSocket.onmessage = (event) => {
        handleSocketMessage(event);
    }

    globalSocket.onerror = (error) => {
        console.error("[Global] WebSocket error:", error);
    };

    globalSocket.onclose = () => {
        console.log("[Global] WebSocket connection closed.");
    };
}
initGlobalSocket();

/**
 * Attach a compact FPS stats widget to the page.
 * @param {HTMLElement} viewerEl - Viewer element to align the stats UI with.
 */
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
    /**
     * Animation loop to update FPS stats.
     */
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

// Populate dropdown with available robot models.
const addRobotSelect = document.getElementById('multi-robot-model');
robotModels.forEach(r => {
    const option = document.createElement('option');
    option.value = r.name;
    option.textContent = r.name;
    multiRobotModelSelect.appendChild(option);
});

/**
 * Append a robot entry to the active-robot dropdown.
 * @param {string} id - Robot id.
 * @param {string} name - Robot model name.
 */
function addRobotOption(id, name) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${name} (${id})`;
    activeRobotSelect.appendChild(opt);
}

/**
 * Animate the camera to frame the currently active robot.
 * @param {number} padding - Fit padding multiplier for the bounding sphere.
 */
function focusCameraOnActiveRobot(padding = 1.35) {
    const record = getActiveRobot();
    if (!record || !record.sceneNode || !viewer || !viewer.camera || !viewer.controls) return;

    const rig = record.sceneNode;
    const box = new THREE.Box3().setFromObject(rig);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    const sphere = new THREE.Sphere();
    box.getCenter(center);
    box.getBoundingSphere(sphere);

    const fov = viewer.camera.fov * (Math.PI / 180);
    const fitDistance = (sphere.radius / Math.sin(fov / 2)) * padding;

    const startPos = viewer.camera.position.clone();
    const startTarget = viewer.controls.target.clone();

    const viewOffset = startPos.clone().sub(startTarget);
    const viewDir = viewOffset.clone().normalize();
    const currentDistance = viewOffset.length();
    const targetDistance = Math.max(currentDistance, fitDistance);

    const cameraPosition = center.clone().add(viewDir.multiplyScalar(targetDistance));

    const duration = 350;
    const startTime = performance.now();

    /**
     * Ease camera and controls toward the target framing.
     */
    function animate() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

        viewer.camera.position.lerpVectors(startPos, cameraPosition, eased);
        viewer.controls.target.lerpVectors(startTarget, center, eased);
        viewer.controls.update();

        if (t < 1) {
            requestAnimationFrame(animate);
        }

        if (viewer.redraw) viewer.redraw();
    }

    animate();
}

/**
 * Focus the camera only when the active robot changes.
 */
function focusActiveRobotIfChanged() {
    const record = getActiveRobot();
    const id = record?.id;
    if (!id || id === lastFocusedRobotId) return;
    focusCameraOnActiveRobot();
    lastFocusedRobotId = id;
}

/**
 * Switch the active robot and refresh per-robot UI state.
 * @param {string|null} robotId - Robot id to activate.
 */
function switchRobot(robotId) {
    const prev = getActiveRobot();
    const prevId = prev?.id || null;
    setActiveRobot(robotId);
    const record = getActiveRobot();
    activeRobotSelect.value = robotId;

    if (prevId === robotId) {
        return;
    }

    controlCenterSliders();
    updateRobotSpecificUI(record);

    if (prevId !== robotId) {
        listRobots().forEach(r => {
            r.manipulator?.setActiveState?.(r.id === robotId);
        });
    }

    if (!robotId) {
        lastFocusedRobotId = null;
    }
}

/**
 * Spawn a robot from a model entry and wire its manipulator/UI.
 * @param {Object} model - Robot model metadata (name, urdf, color).
 */
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

    // Keep rig so removal clears the whole robot space and so the manipulator can use the rig as its baseGroup anchor.
    record.sceneNode = rig;
    rig.updateMatrixWorld(true);

    if (globalSocket) {
        record.state.connectivity.socket = globalSocket;
    }
    const manipulator = record.manipulator;

    // Hand robot and rig to the manipulator.
    manipulator.setRobot(robot, record.id, rig);

    // Build sliders after URDF is ready and recenter the view.
    manipulator.addEventListener('urdf-processed', () => {
        viewer.camera.position.set(-0.5, 1.1, 0.8);
        controlCenterSliders();
        updateRevoluteJointStatus(record);

    });

    // Keep sliders and MCP state in sync when IK updates joints.
    manipulator.addEventListener('angle-change', (e) => {
        if (e && e.detail && controlSliders[e.detail]) {
            controlSliders[e.detail].update();
        } else {
            Object.values(controlSliders).forEach(sl => sl.update());
        }
        updateRevoluteJointStatus(record);

        sendMcpRobotStateUpdate(record);
    });

    // Focus the robot when a joint is grabbed.
    manipulator.addEventListener('manipulate-start', (e) => {
        switchRobot(record.id);
        focusActiveRobotIfChanged();
        
        const j = document.querySelector(`li[joint-name="${e.detail}"]`);
        if (j) {
            j.scrollIntoView({ block: 'nearest' });
            window.scrollTo(0, 0);
        }

        originalNoAutoRecenter = viewer.noAutoRecenter;
        viewer.noAutoRecenter = true;

        record.state.interaction.isManipulating = true;
    });

    // Restore camera recentering after manipulation.
    manipulator.addEventListener('manipulate-end', e => {
        viewer.noAutoRecenter = originalNoAutoRecenter;
        record.state.interaction.isManipulating = false;
        handleManipulateEnd(record)
    });

    // Highlight the matching joint entry on hover.
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
    focusActiveRobotIfChanged();

    robotCountValue.textContent = listRobots().length;
}

/**
 * Spawn a new robot from the selected template.
 */
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

/**
 * Remove the current robot unless it is still connected to OPC UA.
 */
deleteRobotBtn.addEventListener('click', async () => {
    const record = getActiveRobot();

    if (!record) return;

    // Prevent deletion if connected.
    if (record.state.connectivity.connectedUrl) {
        alert("Cannot delete robot while connected to OPC UA server. Please disconnect first.");
        return;
    }
    
    if (record && record.sceneNode) {
        if (record.sceneNode.parent) record.sceneNode.parent.remove(record.sceneNode);
        disposeRobotNode(record.sceneNode);
    }

    await removeRobot(record.id);
    controlCenterSliders();

    // Remove from dropdown.
    const option = activeRobotSelect.querySelector(`option[value="${record.id}"]`);
    if (option) option.remove();

    // Select another robot if available.
    if (activeRobotSelect.options.length > 0) {
        switchRobot(activeRobotSelect.options[0].value);
        focusActiveRobotIfChanged();
    } else {
        switchRobot(null);
    }

    robotCountValue.textContent = listRobots().length;
});

/**
 * Switching the dropdown just changes focus.
 */
activeRobotSelect.addEventListener('change', () => {
    switchRobot(activeRobotSelect.value);
    focusActiveRobotIfChanged();
});

/**
 * Update page background and viewer highlight color.
 * @param {string} color - CSS color string.
 */
const setColor = color => {

    document.body.style.backgroundColor = color;
    viewer.highlightColor = '#' + (new THREE.Color(0xffffff)).lerp(new THREE.Color(color), 0.35).getHexString();

};


/**
 * Toggle joint limits globally.
 */
limitsToggle.addEventListener('click', () => {
    limitsToggle.classList.toggle('checked');
    viewer.ignoreLimits = limitsToggle.classList.contains('checked');
});

/**
 * Switch radians/deg display (internal stays radians).
 */
radiansToggle.addEventListener('click', () => {
    radiansToggle.classList.toggle('checked');
    Object
    .values(controlSliders)
        .forEach(sl => sl.update());
});

/**
 * Toggle collision meshes visibility.
 */
collisionToggle.addEventListener('click', () => {
    collisionToggle.classList.toggle('checked');
    viewer.showCollision = collisionToggle.classList.contains('checked');
    viewer.redraw();
});

/**
 * Toggle auto-recentering on camera updates.
 */
autocenterToggle.addEventListener('click', () => {
    autocenterToggle.classList.toggle('checked');

    viewer.noAutoRecenter = !autocenterToggle.classList.contains('checked');
});

/**
 * Toggle fixed joints visibility in the UI.
 */
hideFixedToggle.addEventListener('click', () => {
    hideFixedToggle.classList.toggle('checked');

    const hideFixed = hideFixedToggle.classList.contains('checked');
    if (hideFixed) controlsel.classList.add('hide-fixed');
    else controlsel.classList.remove('hide-fixed');

});

/**
 * Swap the viewer up axis.
 */
upSelect.addEventListener('change', () => viewer.up = upSelect.value);

/**
 * Collapse or expand the control panel.
 */
controlsToggle.addEventListener('click', () => controlsel.classList.toggle('hidden'));

/**
 * Keep sliders in sync when limits change globally.
 */
viewer.addEventListener('ignore-limits-change', () => {
    Object.values(controlSliders).forEach(sl => sl.update());
});


/**
 * Register mesh loaders and spawn the initial robot after components are ready.
 */
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

    const color = "#546575";
    viewer.up = '+Z';
    document.getElementById('up-select').value = viewer.up;

    setColor(color);
    // Add initial robot.
    const model = robotModels[0];
    addRobotByModel(model);
    
    if (/javascript\/example\/bundle/i.test(window.location)) {
        viewer.package = '../../../urdf';
    }
});


/**
 * Apply camera pose + recenter defaults after viewer bootstraps.
 */
document.addEventListener('WebComponentsReady', () => {

    //viewer.camera.position.set(-1.5, 3.5, 5.5);
    viewer.camera.position.set(-1.5, 1.5, 1.5);
    autocenterToggle.classList.remove('checked');
    viewer.noAutoRecenter = true;
});


/**
 * Rebuild sliders for the active robot and wire joint update handlers.
 */
function controlCenterSliders() {
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
            /**
             * Mark the current robot as being manipulated.
             */
            const startManipulating = () => {
                record.state.interaction.isManipulating = true;
            };

            /**
             * Clear manipulation state and refresh slider display.
             */
            const stopManipulating = () => {
                record.state.interaction.isManipulating = false;
                handleManipulateEnd(record);
                li.update();
            };

            /**
             * Apply a joint value through the manipulator and refresh UI.
             * @param {number} value - Joint value in radians.
             */
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

/**
 * Wire high-level UI toggles to the active robot so panels stay coherent.
 */
toggleRobotDashboardSection();
toggleOpcUaSection();
/**
 * Connect the active robot to OPC UA.
 */
document.getElementById('connect-opc-ua').addEventListener('click', () => {
    connectOpcUa(getActiveRobot());
});

/**
 * Disconnect the active robot from OPC UA.
 */
document.getElementById('disconnect-opc-ua').addEventListener('click', () => {
    disconnectOpcUa(getActiveRobot());
});
/**
 * Toggle OPC UA sync for the active robot.
 */
const opcUaSyncToggle = document.getElementById('opc-ua-sync-toggle');
opcUaSyncToggle.addEventListener('change', (e) => {
    handleOpcUaSyncToggle(getActiveRobot(), e);
});

/**
 * Prevent OPC UA sync toggle clicks from bubbling.
 */
const opcUaSyncToggleContainer = document.getElementById('opc-ua-sync-toggle-container');
opcUaSyncToggleContainer.addEventListener('click', (e) => {
    e.stopPropagation();
}, true);

/**
 * Primary selection handler for OPC UA tree clicks.
 */
document.addEventListener("click", (e) => {
    handleOpcUaNodeSelection(getActiveRobot(), e);
});

/**
 * Detect subtree toggles separately so expand/collapse logic stays isolated.
 */
document.addEventListener("click", async (e) => {
        handleSubtreeClick(getActiveRobot(), e);
});

/**
 * Tab navigation for multi-panel UI (robots, OPC UA, logs, etc.).
 */
document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        const tabName = btn.getAttribute("data-tab");
        switchTab(tabName);
    });
});

/**
 * Manual clear to keep log view readable during long sessions.
 */
document.getElementById('clear-log-btn').addEventListener('click', () => {
    clearLog();
});

/**
 * Intercept context menu events to attach OPC UA actions to selected node.
 */
document.addEventListener("contextmenu", (e) => {
    handleContextMenu(getActiveRobot(), e);
});

/**
 * Close context menus when clicking elsewhere.
 */
document.addEventListener("click", (e) => {
    handleNodeClick(getActiveRobot(), e);
});

/**
 * Context menu actions use the active robot, so keep listeners centralized here.
 */
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

/**
 * Detect outside clicks for context menu dismissal.
 */
window.addEventListener('mousedown', (e) => {
    handleGlobalMouseDown(e);
});

/**
 * DOM elements for the info/properties panes.
 */
const infoBox = document.getElementById("info-box");
const propertiesBox = document.getElementById("properties-box");
const toggleBtn = document.getElementById("info-toggle-btn");
// already defined

/**
 * Internal state for the info/properties toggle.
 */
syncWidth(infoBox, propertiesBox);
initWidthObserver(infoBox, propertiesBox);

let infoBoxExpanded = true;

/**
 * Toggle info/properties panes in tandem so widths stay aligned.
 */
toggleBtn?.addEventListener("click", () => {
    const { width, label } = getToggleDimensions(infoBoxExpanded);
    
    // Apply changes
    infoBox.style.width = width;
    propertiesBox.style.width = width;
    toggleBtn.textContent = label;
    
    // Update state
    infoBoxExpanded = !infoBoxExpanded;
});


/**
 * Keep revolute joint labels consistent after toggling rad/deg display.
 */
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('radians-toggle')?.addEventListener('click', () => {
        setTimeout(() => { updateRevoluteJointStatus(robot); }, 0);
    });
});
/**
 * Refresh properties for the currently selected OPC UA node.
 */
document.getElementById('refresh-info-box').addEventListener('click', () =>{
    refreshSelectedNode();
});

/**
 * Shortcut to reset robot pose to home.
 */
document.getElementById('home-icon').addEventListener('click', () => {
    handleHomeClick(getActiveRobot());
});

/**
 * Toggle backend MCP integration on demand.
 */
document.getElementById('mcp-integration-toggle').addEventListener('click', (e) => {
    toggleMcpIntegration(getActiveRobot(), e);
});


/**
 * Default to hiding fixed joints on first load to reduce noise for users.
 */
window.addEventListener('load', () => {
    // Enable Hide Fixed Joints when loading
    const hideFixedToggle = document.getElementById('hide-fixed');
    hideFixedToggle.dispatchEvent(new Event('click'));
});


