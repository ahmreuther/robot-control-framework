/* globals */
import * as THREE from 'three';
import { registerDragEvents } from './dragAndDrop.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import URDFIKManipulator from './URDFIKManipulator.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

import {
    robotModels,
    addRobot,
    removeRobot,
    listRobots,
    getNextSlotIndex,
    setManipulatorFactory,
    getActiveRobot,
    setActiveRobot,
} from './robot/robotManager.js';

import { spawnRobot, disposeRobotNode } from './scene/sceneManager.js';

import { handleOpcUaNodeSelection, handleSubtreeClick, refreshSelectedNode } from './opcua/addressSpace';
import { connectOpcUa, disconnectOpcUa, handleOpcUaSyncToggle } from './opcua/connection.js';
import './opcua/workspaceSocket.js';
import {
    handleContextMenu,
    handleNodeClick,
    handleContextCallMethod,
    handleContextSubscribe,
    handleContextUnsubscribe,
    handleContextSubscribeEvent,
    handleContextUnsubscribeEvent,
    handleGlobalMouseDown,
} from './opcua/contextMenu.js';
import { toggleMcpIntegration, sendMcpRobotStateUpdate } from './robot/mcp.js';
import {
    toggleOpcUaSection,
    toggleRobotDashboardSection,
    switchTab,
    syncWidth,
    initWidthObserver,
    getToggleDimensions,
} from './ui/layout.js';
import { logMessageToBox, clearLog } from './ui/logging.js';
import { updateRevoluteJointStatus, handleManipulateEnd, handleHomeClick, updateRobotSpecificUI } from './ui/robotUiState.js';

customElements.define('urdf-viewer', URDFIKManipulator);

const viewer = document.querySelector('urdf-viewer');
viewer.ignoreKeys = true;
setupMiniStats(viewer);

const limitsToggle = document.getElementById('ignore-joint-limits');
const collisionToggle = document.getElementById('collision-toggle');
const envelopeToggle = document.getElementById('show-work-envelope');
const resolutionGroup = document.getElementById('workspace-resolution');
const radiansToggle = document.getElementById('radians-toggle');
const autocenterToggle = document.getElementById('autocenter-toggle');
const upSelect = document.getElementById('up-select');
const sliderList = document.querySelector('#controls ul');
const controlsel = document.getElementById('controls');
const controlsToggle = document.getElementById('toggle-controls');
const animToggle = document.getElementById('do-animate');
const hideFixedToggle = document.getElementById('hide-fixed');
const innerShellToggle = document.getElementById('show-inner-shell');
const exportToggle = document.getElementById('export');
const progressHost = document.getElementById('workspace-progress');

const multiRobotModelSelect = document.getElementById('multi-robot-model');
const addRobotBtn = document.getElementById('add-robot-btn');
const activeRobotSelect = document.getElementById('active-robot-select');
const deleteRobotBtn = document.getElementById('delete-robot-btn');
const robotCountValue = document.getElementById('robot-count-value');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 1 / DEG2RAD;

let controlSliders = {};
let originalNoAutoRecenter = null;
let lastFocusedRobotId = null;

let isSampling = false;
let samplingAborted = false;
let workspaceAbortController = null;
let workspaceSeqInFlight = null;
let workspaceResolution = 'medium';
let cachedSurfacePointCloud = null;
let pointCloudGroup = null;
let pointCloudObject = null;
let surfaceCloudVisible = !!envelopeToggle?.classList.contains('checked');
let wsDoneHandlerAttached = false;

const WORKSPACE_RES = {
    low: { samples: 1_000_000, voxel_size: 0.02 },
    medium: { samples: 4_000_000, voxel_size: 0.015 },
    high: { samples: 8_000_000, voxel_size: 0.01 },
};

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

window.addEventListener('ws-ready', () => {
    attachWsProcessingDoneHandler();
});

function getWS() {
    return window.__WS_PCD__ || null;
}

function createAbortError(message = 'Aborted') {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
}

function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function setResolutionUI(value) {
    workspaceResolution = value in WORKSPACE_RES ? value : 'medium';
    resolutionGroup?.querySelectorAll('.seg-btn')?.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.res === workspaceResolution);
    });

    const idx = workspaceResolution === 'low' ? 0 : workspaceResolution === 'high' ? 2 : 1;
    resolutionGroup?.style?.setProperty('--seg-index', String(idx));
}

function ensureProgressUI() {
    if (!progressHost) return null;

    let wrap = progressHost.querySelector('.ws-progress-wrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'ws-progress-wrap';
        wrap.style.display = 'none';
        wrap.style.padding = '6px 0';

        const label = document.createElement('div');
        label.className = 'ws-progress-label';
        label.style.font = '12px/1.2 system-ui, sans-serif';
        label.style.opacity = '0.9';
        label.style.marginBottom = '6px';
        label.textContent = 'Workspace: 0%';

        const barBg = document.createElement('div');
        barBg.className = 'ws-progress-bg';
        barBg.style.height = '10px';
        barBg.style.borderRadius = '6px';
        barBg.style.background = 'rgba(255,255,255,0.15)';
        barBg.style.overflow = 'hidden';

        const bar = document.createElement('div');
        bar.className = 'ws-progress-bar';
        bar.style.height = '100%';
        bar.style.width = '0%';
        bar.style.borderRadius = '6px';
        bar.style.background = 'rgba(0, 255, 0, 0.75)';

        barBg.appendChild(bar);
        wrap.appendChild(label);
        wrap.appendChild(barBg);
        progressHost.appendChild(wrap);
    }

    return {
        wrap,
        label: wrap.querySelector('.ws-progress-label'),
        bar: wrap.querySelector('.ws-progress-bar'),
    };
}

function showProgress() {
    const ui = ensureProgressUI();
    if (!ui) return null;
    progressHost.style.display = 'block';
    ui.wrap.style.display = 'block';
    setProgress(0, 'Initialisiere...');
    return ui;
}

function hideProgress() {
    const ui = ensureProgressUI();
    if (!ui) return;
    progressHost.style.display = 'none';
    ui.wrap.style.display = 'none';
}

function setProgress(pct, text) {
    const ui = ensureProgressUI();
    if (!ui) return;

    const clamped = Math.max(0, Math.min(100, pct));
    ui.bar.style.width = `${clamped}%`;
    ui.label.textContent = text ? `${text} (${clamped.toFixed(0)}%)` : `${clamped.toFixed(0)}%`;
}

function attachWsProcessingDoneHandler() {
    const ws = getWS();
    if (!ws || wsDoneHandlerAttached) return;

    wsDoneHandlerAttached = true;
    ws.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        if (event.data.startsWith('surface_done|')) {
            setProgress(100, 'Fertig');
            setTimeout(() => hideProgress(), 300);
        }
    });
}

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
    stats.dom.title = 'Klicken: FPS -> MS -> RAM';
    (function loop() {
        stats.update();
        requestAnimationFrame(loop);
    }());
}

window.addEventListener('keydown', (event) => {
    const activeRecord = getActiveRobot();
    if (activeRecord?.manipulator && typeof activeRecord.manipulator.handleKey === 'function') {
        activeRecord.manipulator.handleKey(event.key);
    }
});

setManipulatorFactory(() => {
    if (!viewer) return null;
    return new URDFIKManipulator({
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
        },
    });
});

setResolutionUI(workspaceResolution);

function disposeGroup(group) {
    if (!group) return;
    group.traverse((child) => {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
    });
}

function makeGroupNonPickable(group) {
    if (!group) return;
    group.traverse((obj) => {
        obj.raycast = () => null;
    });
}

function getWorkspaceRobot(viewerEl) {
    return getActiveRobot()?.manipulator?.robot || viewerEl.robot || null;
}

function findToolPoint(robot) {
    let toolPoint = null;
    robot.traverse((child) => {
        if (child.name === 'tool_point') toolPoint = child;
    });
    if (!toolPoint) {
        robot.traverse((child) => {
            if (child.isURDFLink && child.children.length === 0) toolPoint = child;
        });
    }
    return toolPoint;
}

function collectMovableJoints(robot) {
    const movable = [];
    robot.traverse((child) => {
        if (child.isURDFJoint && child.jointType !== 'fixed') {
            const lo = child.limit && Number.isFinite(child.limit.lower) ? child.limit.lower : -Math.PI;
            const hi = child.limit && Number.isFinite(child.limit.upper) ? child.limit.upper : Math.PI;
            movable.push({
                obj: child,
                min: lo,
                max: hi,
                range: hi - lo,
            });
        }
    });
    return movable;
}

function snapshotJointPose(movableJoints) {
    const snapshot = new Map();
    for (const joint of movableJoints) snapshot.set(joint.obj.name, joint.obj.angle);
    return snapshot;
}

function applyJointPose(movableJoints, snapshot) {
    for (const joint of movableJoints) {
        const angle = snapshot.get(joint.obj.name);
        if (angle !== undefined) joint.obj.setJointValue(angle);
    }
}

function makeCircleSpriteTexture(size = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const r = size / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);

    gradient.addColorStop(0.0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1.0, 'rgba(255,255,255,0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

const CIRCLE_TEX = makeCircleSpriteTexture(64);
const PCD_HEADER_BYTES = 52;

function buildPointCloud(points, { size = 0.006, opacity = 0.45 } = {}) {
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i += 1) {
        positions[i * 3] = points[i].x;
        positions[i * 3 + 1] = points[i].y;
        positions[i * 3 + 2] = points[i].z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.computeBoundingSphere?.();

    const mat = new THREE.PointsMaterial({
        color: 0x33ff66,
        size,
        sizeAttenuation: true,
        map: CIRCLE_TEX,
        alphaMap: CIRCLE_TEX,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    return new THREE.Points(geo, mat);
}

function updatePointCloudGeometry(pointsObj, points) {
    if (!pointsObj) return;

    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i += 1) {
        positions[i * 3] = points[i].x;
        positions[i * 3 + 1] = points[i].y;
        positions[i * 3 + 2] = points[i].z;
    }

    pointsObj.geometry?.dispose?.();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.computeBoundingSphere?.();
    pointsObj.geometry = geo;
}

function ensurePointCloud(viewerEl) {
    if (pointCloudGroup) return;

    pointCloudGroup = new THREE.Group();
    pointCloudGroup.name = 'rawPointCloudGroup';
    pointCloudObject = buildPointCloud([], { size: 0.01, opacity: 0.7 });
    pointCloudGroup.add(pointCloudObject);
    viewerEl.scene.add(pointCloudGroup);
    makeGroupNonPickable(pointCloudGroup);
}

function clearPointCloud(viewerEl) {
    if (!pointCloudGroup) return;
    viewerEl.scene.remove(pointCloudGroup);
    disposeGroup(pointCloudGroup);
    pointCloudGroup = null;
    pointCloudObject = null;
}

function resetSurfacePointCloud(viewerEl) {
    cachedSurfacePointCloud = null;
    clearPointCloud(viewerEl);
}

function applySurfaceCloudVisibility(viewerEl) {
    if (!cachedSurfacePointCloud?.pointsWorld?.length) {
        clearPointCloud(viewerEl);
        viewerEl.redraw?.();
        return;
    }

    if (surfaceCloudVisible) {
        showRawPointCloud(viewerEl, cachedSurfacePointCloud.pointsWorld, { size: 0.01, opacity: 0.9 });
    } else {
        clearPointCloud(viewerEl);
        viewerEl.redraw?.();
    }
}

function showRawPointCloud(viewerEl, pointsWorld, { size = 0.01, opacity = 0.7 } = {}) {
    cachedSurfacePointCloud = { pointsWorld };
    if (!surfaceCloudVisible) {
        clearPointCloud(viewerEl);
        return;
    }

    ensurePointCloud(viewerEl);
    updatePointCloudGeometry(pointCloudObject, pointsWorld);

    if (pointCloudObject?.material) {
        pointCloudObject.material.size = size;
        pointCloudObject.material.opacity = opacity;
        pointCloudObject.material.needsUpdate = true;
    }

    viewerEl.redraw?.();
}

window.showRawPointCloud = showRawPointCloud;

function computeBBox(points) {
    let minx = Infinity;
    let miny = Infinity;
    let minz = Infinity;
    let maxx = -Infinity;
    let maxy = -Infinity;
    let maxz = -Infinity;

    for (const point of points) {
        const { x, y, z } = point;
        if (x < minx) minx = x;
        if (y < miny) miny = y;
        if (z < minz) minz = z;
        if (x > maxx) maxx = x;
        if (y > maxy) maxy = y;
        if (z > maxz) maxz = z;
    }

    return { minx, miny, minz, maxx, maxy, maxz };
}

function makeSeqId() {
    return (Math.random() * 0xFFFFFFFF) >>> 0;
}

export async function sendPointCloudQuant16ChunkedAsync(ws, pointsWorld, {
    chunkPoints = 200000,
    seqId = makeSeqId(),
    yieldEveryChunks = 1,
    onLocalProgress = null,
    onSeqId = null,
    signal = null,
} = {}) {
    if (signal?.aborted || samplingAborted) {
        throw createAbortError('Upload aborted');
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn('[PCD2] websocket not open');
        return null;
    }

    ws.binaryType = 'arraybuffer';
    const totalPoints = pointsWorld.length >>> 0;
    if (!totalPoints) return null;

    const { minx, miny, minz, maxx, maxy, maxz } = computeBBox(pointsWorld);
    const dx = (maxx - minx) || 1e-9;
    const dy = (maxy - miny) || 1e-9;
    const dz = (maxz - minz) || 1e-9;
    const scalex = dx / 65535.0;
    const scaley = dy / 65535.0;
    const scalez = dz / 65535.0;
    const chunkCount = Math.ceil(totalPoints / chunkPoints) >>> 0;

    if (typeof onSeqId === 'function') {
        try { onSeqId(seqId); } catch { /* ignore */ }
    }

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        if (signal?.aborted || samplingAborted) {
            throw createAbortError('Upload aborted');
        }

        const startIndex = chunkIndex * chunkPoints;
        const end = Math.min(startIndex + chunkPoints, totalPoints);
        const n = (end - startIndex) >>> 0;
        const dataBytes = n * 3 * 2;
        const buf = new ArrayBuffer(PCD_HEADER_BYTES + dataBytes);
        const dv = new DataView(buf);

        dv.setUint8(0, 0x50);
        dv.setUint8(1, 0x43);
        dv.setUint8(2, 0x44);
        dv.setUint8(3, 0x32);

        dv.setUint32(4, seqId, true);
        dv.setUint32(8, chunkIndex >>> 0, true);
        dv.setUint32(12, chunkCount, true);
        dv.setUint32(16, totalPoints, true);
        dv.setUint32(20, startIndex >>> 0, true);
        dv.setUint32(24, n, true);

        dv.setFloat32(28, minx, true);
        dv.setFloat32(32, miny, true);
        dv.setFloat32(36, minz, true);
        dv.setFloat32(40, scalex, true);
        dv.setFloat32(44, scaley, true);
        dv.setFloat32(48, scalez, true);

        let off = PCD_HEADER_BYTES;
        for (let i = startIndex; i < end; i += 1) {
            const point = pointsWorld[i];
            const qx = Math.max(0, Math.min(65535, Math.round((point.x - minx) / scalex)));
            const qy = Math.max(0, Math.min(65535, Math.round((point.y - miny) / scaley)));
            const qz = Math.max(0, Math.min(65535, Math.round((point.z - minz) / scalez)));

            dv.setUint16(off, qx, true);
            dv.setUint16(off + 2, qy, true);
            dv.setUint16(off + 4, qz, true);
            off += 6;
        }

        ws.send(buf);
        onLocalProgress?.(chunkIndex + 1, chunkCount);

        if (((chunkIndex + 1) % yieldEveryChunks) === 0) {
            await nextFrame();
            if (signal?.aborted || samplingAborted) {
                throw createAbortError('Upload aborted');
            }
        }
    }

    return { seqId, totalPoints, chunkCount };
}

async function sampleWorkspacePointCloud(viewerEl, config) {
    const robot = getWorkspaceRobot(viewerEl);
    if (!robot) throw new Error('Kein aktiver Roboter verfuegbar.');

    const toolPoint = findToolPoint(robot);
    if (!toolPoint) throw new Error('Kein tool_point / Endeffektor-Link gefunden.');

    const movableJoints = collectMovableJoints(robot);
    if (!movableJoints.length) throw new Error('Keine beweglichen Joints gefunden.');

    const poseAtButtonPress = snapshotJointPose(movableJoints);
    const pts = [];
    const pos = new THREE.Vector3();
    const total = config.samples;
    const chunk = Math.max(200, config.sampleChunk | 0);

    console.time('Workspace: Sampling');

    for (let i = 0; i < total; i += 1) {
        if (samplingAborted) break;

        for (let j = 0; j < movableJoints.length; j += 1) {
            const joint = movableJoints[j];
            joint.obj.setJointValue(joint.min + Math.random() * (joint.range || 1));
        }

        robot.updateMatrixWorld(true);
        toolPoint.getWorldPosition(pos);
        pts.push(pos.clone());

        if ((i + 1) % chunk === 0) {
            applyJointPose(movableJoints, poseAtButtonPress);
            robot.updateMatrixWorld(true);
            setProgress(((i + 1) / total) * 95, 'Sampling');
            await nextFrame();
        }
    }

    applyJointPose(movableJoints, poseAtButtonPress);
    robot.updateMatrixWorld(true);
    console.timeEnd('Workspace: Sampling');

    return pts;
}

export async function sampleAndSendWorkspacePointCloud(viewerEl, ws, {
    samples = 8000000,
    sampleChunk = 2500,
    sendChunkPoints = 200000,
    yieldEverySendChunks = 1,
    onSendProgress = null,
    onSeqId = null,
    signal = null,
} = {}) {
    const pointsWorld = await sampleWorkspacePointCloud(viewerEl, { samples, sampleChunk });
    return sendPointCloudQuant16ChunkedAsync(ws, pointsWorld, {
        chunkPoints: sendChunkPoints,
        yieldEveryChunks: yieldEverySendChunks,
        onLocalProgress: onSendProgress,
        onSeqId,
        signal,
    });
}

robotModels.forEach((robot) => {
    const option = document.createElement('option');
    option.value = robot.name;
    option.textContent = robot.name;
    multiRobotModelSelect.appendChild(option);
});

function addRobotOption(id, name) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${name} (${id})`;
    activeRobotSelect.appendChild(opt);
}

function focusCameraOnActiveRobot(padding = 1.35) {
    const record = getActiveRobot();
    if (!record?.sceneNode || !viewer?.camera || !viewer.controls) return;

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

        viewer.redraw?.();
    }

    animate();
}

function focusActiveRobotIfChanged() {
    const id = getActiveRobot()?.id;
    if (!id || id === lastFocusedRobotId) return;
    focusCameraOnActiveRobot();
    lastFocusedRobotId = id;
}

function switchRobot(robotId) {
    const prevId = getActiveRobot()?.id || null;
    setActiveRobot(robotId);
    const record = getActiveRobot();
    activeRobotSelect.value = robotId;

    if (prevId === robotId) return;

    controlCenterSliders();
    updateRobotSpecificUI(record);

    if (prevId !== robotId) {
        listRobots().forEach((robot) => {
            robot.manipulator?.setActiveState?.(robot.id === robotId);
        });
    }

    if (!robotId) {
        lastFocusedRobotId = null;
    }
}

async function addRobotByModel(model) {
    const slotIndex = getNextSlotIndex();
    const record = await addRobot({
        model: model.name,
        urdfPath: model.urdf,
        sceneNode: null,
        slotIndex,
    });

    const spawned = await spawnRobot(viewer, { urdfPath: model.urdf, slotIndex, getNextSlotIndex });
    if (!spawned) return;

    const { rig, robot } = spawned;
    record.sceneNode = rig;
    rig.updateMatrixWorld(true);

    const manipulator = record.manipulator;
    manipulator.setRobot(robot, record.id, rig);

    manipulator.addEventListener('urdf-processed', () => {
        viewer.camera.position.set(-0.5, 1.1, 0.8);
        controlCenterSliders();
        updateRevoluteJointStatus(record);
        resetSurfacePointCloud(viewer);
    });

    manipulator.addEventListener('angle-change', (event) => {
        if (event?.detail && controlSliders[event.detail]) {
            controlSliders[event.detail].update();
        } else {
            Object.values(controlSliders).forEach((slider) => slider.update());
        }
        updateRevoluteJointStatus(record);
        sendMcpRobotStateUpdate(record);
    });

    manipulator.addEventListener('manipulate-start', (event) => {
        switchRobot(record.id);
        focusActiveRobotIfChanged();

        const joint = document.querySelector(`li[joint-name="${event.detail}"]`);
        if (joint) {
            joint.scrollIntoView({ block: 'nearest' });
            window.scrollTo(0, 0);
        }

        originalNoAutoRecenter = viewer.noAutoRecenter;
        viewer.noAutoRecenter = true;
        record.state.interaction.isManipulating = true;
    });

    manipulator.addEventListener('manipulate-end', () => {
        viewer.noAutoRecenter = originalNoAutoRecenter;
        record.state.interaction.isManipulating = false;
        handleManipulateEnd(record);
    });

    manipulator.addEventListener('joint-mouseover', (event) => {
        const joint = document.querySelector(`li[joint-name="${event.detail}"]`);
        if (joint) joint.setAttribute('robot-hovered', true);
    });

    manipulator.addEventListener('joint-mouseout', (event) => {
        const joint = document.querySelector(`li[joint-name="${event.detail}"]`);
        if (joint) joint.removeAttribute('robot-hovered');
    });

    addRobotOption(record.id, model.name);
    switchRobot(record.id);
    focusActiveRobotIfChanged();
    robotCountValue.textContent = listRobots().length;
}

addRobotBtn.addEventListener('click', async () => {
    try {
        const selectedName = multiRobotModelSelect.value;
        if (!selectedName) return;

        const model = robotModels.find((robot) => robot.name === selectedName);
        if (!model) return;
        await addRobotByModel(model);
    } catch (error) {
        console.error('Failed to add robot', error);
        logMessageToBox(`Failed to add robot: ${error?.message || error}`);
    }
});

deleteRobotBtn.addEventListener('click', async () => {
    const record = getActiveRobot();
    if (!record) return;

    if (record.state.connectivity.connectedUrl) {
        alert('Cannot delete robot while connected to OPC UA server. Please disconnect first.');
        return;
    }

    if (record.sceneNode) {
        record.sceneNode.parent?.remove(record.sceneNode);
        disposeRobotNode(record.sceneNode);
    }

    await removeRobot(record.id);
    controlCenterSliders();

    const option = activeRobotSelect.querySelector(`option[value="${record.id}"]`);
    option?.remove();

    if (activeRobotSelect.options.length > 0) {
        switchRobot(activeRobotSelect.options[0].value);
        focusActiveRobotIfChanged();
    } else {
        switchRobot(null);
    }

    robotCountValue.textContent = listRobots().length;
    resetSurfacePointCloud(viewer);
});

activeRobotSelect.addEventListener('change', () => {
    switchRobot(activeRobotSelect.value);
    focusActiveRobotIfChanged();
});

const setColor = (color) => {
    document.body.style.backgroundColor = color;
    viewer.highlightColor = `#${(new THREE.Color(0xffffff)).lerp(new THREE.Color(color), 0.35).getHexString()}`;
};

limitsToggle?.addEventListener('click', () => {
    limitsToggle.classList.toggle('checked');
    viewer.ignoreLimits = limitsToggle.classList.contains('checked');
});

radiansToggle?.addEventListener('click', () => {
    radiansToggle.classList.toggle('checked');
    Object.values(controlSliders).forEach((slider) => slider.update());
});

collisionToggle?.addEventListener('click', () => {
    collisionToggle.classList.toggle('checked');
    viewer.showCollision = collisionToggle.classList.contains('checked');
    viewer.redraw?.();
});

envelopeToggle?.addEventListener('click', async () => {
    envelopeToggle.classList.toggle('checked');
    animToggle?.classList.remove('checked');
    surfaceCloudVisible = envelopeToggle.classList.contains('checked');

    const ws = getWS();
    if (!surfaceCloudVisible) {
        samplingAborted = true;
        try { workspaceAbortController?.abort(); } catch { /* ignore */ }
        workspaceAbortController = null;

        if (ws?.readyState === WebSocket.OPEN) {
            try {
                ws.send(workspaceSeqInFlight !== null ? `pcd_abort|seq=${workspaceSeqInFlight}` : 'pcd_abort');
            } catch { /* ignore */ }
        }

        workspaceSeqInFlight = null;
        isSampling = false;
        hideProgress();
        applySurfaceCloudVisibility(viewer);
        return;
    }

    if (cachedSurfacePointCloud?.pointsWorld?.length) {
        applySurfaceCloudVisibility(viewer);
        return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn('[index.js] WebSocket not open yet.');
        return;
    }

    const resCfg = WORKSPACE_RES[workspaceResolution] || WORKSPACE_RES.medium;
    ws.send(`pcd_cfg|voxel_size=${resCfg.voxel_size}`);

    samplingAborted = false;
    isSampling = true;
    workspaceSeqInFlight = null;
    workspaceAbortController = new AbortController();

    showProgress();
    setProgress(0, 'Sampling');
    await nextFrame();
    attachWsProcessingDoneHandler();

    try {
        await sampleAndSendWorkspacePointCloud(viewer, ws, {
            samples: resCfg.samples,
            sampleChunk: 2500,
            sendChunkPoints: 200000,
            onSendProgress: (k, n) => {
                setProgress(Math.round((k / n) * 100), 'Sende Pointcloud an Backend');
            },
            onSeqId: (seqId) => {
                workspaceSeqInFlight = seqId;
            },
            signal: workspaceAbortController.signal,
        });

        setProgress(100, 'Upload fertig');
        await nextFrame();
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.error(error);
        }
        hideProgress();
    } finally {
        isSampling = false;
    }
});

resolutionGroup?.addEventListener('click', (event) => {
    const btn = event.target.closest('.seg-btn');
    if (!btn) return;

    setResolutionUI(btn.dataset.res);

    if (envelopeToggle?.classList.contains('checked')) {
        cachedSurfacePointCloud = null;
        clearPointCloud(viewer);
        envelopeToggle.classList.remove('checked');
        envelopeToggle.dispatchEvent(new Event('click'));
    }
});

innerShellToggle?.addEventListener('click', () => {
    innerShellToggle.classList.toggle('checked');
});

autocenterToggle?.addEventListener('click', () => {
    autocenterToggle.classList.toggle('checked');
    viewer.noAutoRecenter = !autocenterToggle.classList.contains('checked');
});

hideFixedToggle?.addEventListener('click', () => {
    hideFixedToggle.classList.toggle('checked');
    controlsel.classList.toggle('hide-fixed', hideFixedToggle.classList.contains('checked'));
});

upSelect?.addEventListener('change', () => {
    viewer.up = upSelect.value;
});

controlsToggle?.addEventListener('click', () => {
    controlsel.classList.toggle('hidden');
});

viewer.addEventListener('ignore-limits-change', () => {
    Object.values(controlSliders).forEach((slider) => slider.update());
});

function controlCenterSliders() {
    Object.values(controlSliders).forEach((item) => item.remove());
    controlSliders = {};

    const record = getActiveRobot();
    const manipulator = record?.manipulator;
    const robot = manipulator?.robot;
    if (!robot?.joints) return;

    Object.keys(robot.joints)
        .sort((a, b) => {
            const da = a.split(/[^\d]+/g).filter(Boolean).pop();
            const db = b.split(/[^\d]+/g).filter(Boolean).pop();
            if (da !== undefined && db !== undefined) {
                const delta = parseFloat(da) - parseFloat(db);
                if (delta !== 0) return delta;
            }
            if (a > b) return 1;
            if (b > a) return -1;
            return 0;
        })
        .forEach((jointName) => {
            const joint = robot.joints[jointName];
            if (joint.jointType === 'prismatic' && Array.isArray(joint.mimicJoints) && joint.mimicJoints.length === 0) {
                return;
            }

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
                const current = manipulator?.robot?.joints?.[jointName];
                if (!current) return;

                const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : RAD2DEG;
                let angle = current.angle;
                if (current.jointType === 'revolute' || current.jointType === 'continuous') {
                    angle *= degMultiplier;
                }

                angle = Math.abs(angle) > 1 ? angle.toFixed(1) : angle.toPrecision(2);
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
                li.update = () => {};
                input.remove();
                slider.remove();
            }

            const startManipulating = () => {
                record.state.interaction.isManipulating = true;
            };

            const stopManipulating = () => {
                record.state.interaction.isManipulating = false;
                handleManipulateEnd(record);
                li.update();
            };

            const applyJointValue = (value) => {
                manipulator?.setJointValue?.(jointName, value);
                li.update();
            };

            slider.addEventListener('input', () => {
                startManipulating();
                applyJointValue(parseFloat(slider.value));
            });
            slider.addEventListener('pointerup', stopManipulating);
            slider.addEventListener('touchend', stopManipulating);
            slider.addEventListener('change', stopManipulating);

            input.addEventListener('change', () => {
                const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : DEG2RAD;
                startManipulating();
                applyJointValue(parseFloat(input.value) * degMultiplier);
                stopManipulating();
            });

            li.update();
            controlSliders[jointName] = li;
        });

    if (manipulator && !record?._controlCenterListenerAttached) {
        manipulator.addEventListener('angle-change', (event) => {
            const jointName = event?.detail;
            if (jointName && controlSliders[jointName]) {
                controlSliders[jointName].update();
            } else {
                Object.values(controlSliders).forEach((item) => item.update());
            }
        });
        record._controlCenterListenerAttached = true;
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
opcUaSyncToggle.addEventListener('change', (event) => {
    handleOpcUaSyncToggle(getActiveRobot(), event);
});

document.getElementById('opc-ua-sync-toggle-container').addEventListener('click', (event) => {
    event.stopPropagation();
}, true);

document.addEventListener('click', (event) => {
    handleOpcUaNodeSelection(getActiveRobot(), event);
});

document.addEventListener('click', async (event) => {
    handleSubtreeClick(getActiveRobot(), event);
});

document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        switchTab(btn.getAttribute('data-tab'));
    });
});

document.getElementById('clear-log-btn').addEventListener('click', () => {
    clearLog();
});

document.addEventListener('contextmenu', (event) => {
    handleContextMenu(getActiveRobot(), event);
});

document.addEventListener('click', (event) => {
    handleNodeClick(getActiveRobot(), event);
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

window.addEventListener('mousedown', (event) => {
    handleGlobalMouseDown(event);
});

const infoBox = document.getElementById('info-box');
const propertiesBox = document.getElementById('properties-box');
const toggleBtn = document.getElementById('info-toggle-btn');

syncWidth(infoBox, propertiesBox);
initWidthObserver(infoBox, propertiesBox);

let infoBoxExpanded = true;
toggleBtn?.addEventListener('click', () => {
    const { width, label } = getToggleDimensions(infoBoxExpanded);
    infoBox.style.width = width;
    propertiesBox.style.width = width;
    toggleBtn.textContent = label;
    infoBoxExpanded = !infoBoxExpanded;
});

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('radians-toggle')?.addEventListener('click', () => {
        setTimeout(() => {
            const record = getActiveRobot();
            if (record) updateRevoluteJointStatus(record);
        }, 0);
    });
});

document.getElementById('refresh-info-box').addEventListener('click', () => {
    refreshSelectedNode();
});

document.getElementById('home-icon').addEventListener('click', () => {
    handleHomeClick(getActiveRobot());
});

document.getElementById('mcp-integration-toggle').addEventListener('click', (event) => {
    toggleMcpIntegration(getActiveRobot(), event);
});

window.addEventListener('load', () => {
    document.getElementById('hide-fixed')?.dispatchEvent(new Event('click'));
});

document.addEventListener('WebComponentsReady', () => {
    viewer.loadMeshFunc = (path, manager, done) => {
        const ext = path.split(/\./g).pop().toLowerCase();
        switch (ext) {
        case 'gltf':
        case 'glb':
            new GLTFLoader(manager).load(path, (result) => done(result.scene), null, (err) => done(null, err));
            break;
        case 'obj':
            new OBJLoader(manager).load(path, (result) => done(result), null, (err) => done(null, err));
            break;
        case 'dae':
            new ColladaLoader(manager).load(path, (result) => done(result.scene), null, (err) => done(null, err));
            break;
        case 'stl':
            new STLLoader(manager).load(
                path,
                (result) => {
                    const material = new THREE.MeshPhongMaterial();
                    done(new THREE.Mesh(result, material));
                },
                null,
                (err) => done(null, err),
            );
            break;
        default:
            break;
        }
    };

    viewer.up = '+Z';
    upSelect.value = viewer.up;
    setColor('#546575');
    addRobotByModel(robotModels[0]);

    if (/javascript\/example\/bundle/i.test(window.location)) {
        viewer.package = '../../../urdf';
    }

    registerDragEvents(viewer, () => {
        setColor('#263238');
        animToggle?.classList.remove('checked');
        resetSurfacePointCloud(viewer);
        envelopeToggle?.classList.remove('checked');
    });
});

document.addEventListener('WebComponentsReady', () => {
    viewer.camera.position.set(-1.5, 1.5, 1.5);
    autocenterToggle?.classList.remove('checked');
    viewer.noAutoRecenter = true;
});
