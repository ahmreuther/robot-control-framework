// /* globals */
// import * as THREE from 'three';
// import { registerDragEvents } from './dragAndDrop.js';
// import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
// import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
// import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
// import URDFManipulator from 'urdf-loader/src/urdf-manipulator-element.js';
// import URDFIKManipulator from './URDFIKManipulator.js';
// import Stats from 'three/examples/jsm/libs/stats.module.js';
// import { exportSlicesToPLY, exportSlicesWithMetadata } from './export_slices.js';

// customElements.define('urdf-viewer', URDFIKManipulator);

// const viewer = document.querySelector('urdf-viewer');
// setupMiniStats(viewer);

// const limitsToggle = document.getElementById('ignore-joint-limits');
// const collisionToggle = document.getElementById('collision-toggle');
// const envelopeToggle = document.getElementById('show-work-envelope');
// const radiansToggle = document.getElementById('radians-toggle');
// const autocenterToggle = document.getElementById('autocenter-toggle');
// const upSelect = document.getElementById('up-select');
// const sliderList = document.querySelector('#controls ul');
// const controlsel = document.getElementById('controls');
// const controlsToggle = document.getElementById('toggle-controls');
// const animToggle = document.getElementById('do-animate');
// const hideFixedToggle = document.getElementById('hide-fixed');
// const ikMove = document.getElementById('ik-move');

// // Toggle-Element für innere Punkte (HTML: <div id="show-inner-shell" class="toggle">Inner</div>)
// const innerShellToggle = document.getElementById('show-inner-shell');

// // Export Button (HTML: <div id="export" class="toggle" style="display:none;">Export</div>)
// const exportToggle = document.getElementById('export');

// // Fortschrittsbalken Container (HTML: <div id="workspace-progress"></div>)
// const progressHost = document.getElementById('workspace-progress');

// // NEW: Slice-Slider Host (HTML: <div id="slice-slider-host"></div> optional, sonst body)
// const sliceSliderHost = document.getElementById('slice-slider-host') || document.body;

// const DEG2RAD = Math.PI / 180;
// const RAD2DEG = 1 / DEG2RAD;

// let sliders = {};

// // Sampling control flags
// let isSampling = false;
// let samplingAborted = false;

// // Workspace visuals cache
// let hullGroup = null;
// let cachedHullGroup = null;
// let cachedShellData = null;

// // Slice display cache
// let slicePointsGroup = null;        // group that holds slice points
// let slicePointCloudObject = null;   // Points object for slice display
// let sliceUI = null;                // slider UI elements
// let currentSliceIndex = 0;

// // Rendered objects
// let innerShellObject = null;
// let innerNormalsObject = null;

// // Full point cloud cache (für Export / Slice)
// let cachedPointCloud = null; // { origin, basis:{x,y,z}, points:[{p:Vector3, d:Vector3}], sliceData }

// // ============================================================
// // Minimal Progress UI (DOM) – keine externen CSS-Abhängigkeiten
// // ============================================================
// function ensureProgressUI() {
//   if (!progressHost) return null;

//   let wrap = progressHost.querySelector('.ws-progress-wrap');
//   if (!wrap) {
//     wrap = document.createElement('div');
//     wrap.className = 'ws-progress-wrap';
//     wrap.style.display = 'none';
//     wrap.style.padding = '6px 0';

//     const label = document.createElement('div');
//     label.className = 'ws-progress-label';
//     label.style.font = '12px/1.2 system-ui, sans-serif';
//     label.style.opacity = '0.9';
//     label.style.marginBottom = '6px';
//     label.textContent = 'Workspace: 0%';

//     const barBg = document.createElement('div');
//     barBg.className = 'ws-progress-bg';
//     barBg.style.height = '10px';
//     barBg.style.borderRadius = '6px';
//     barBg.style.background = 'rgba(255,255,255,0.15)';
//     barBg.style.overflow = 'hidden';

//     const bar = document.createElement('div');
//     bar.className = 'ws-progress-bar';
//     bar.style.height = '100%';
//     bar.style.width = '0%';
//     bar.style.borderRadius = '6px';
//     bar.style.background = 'rgba(0, 255, 0, 0.75)';

//     barBg.appendChild(bar);
//     wrap.appendChild(label);
//     wrap.appendChild(barBg);
//     progressHost.appendChild(wrap);
//   }

//   return {
//     wrap,
//     label: wrap.querySelector('.ws-progress-label'),
//     bar: wrap.querySelector('.ws-progress-bar'),
//   };
// }

// function showProgress() {
//   const ui = ensureProgressUI();
//   if (!ui) return null;
//   progressHost.style.display = 'block';
//   ui.wrap.style.display = 'block';
//   setProgress(0, 'Initialisiere…');
//   return ui;
// }

// function hideProgress() {
//   const ui = ensureProgressUI();
//   if (!ui) return;
//   progressHost.style.display = 'none';
//   ui.wrap.style.display = 'none';
// }

// function setProgress(pct, text) {
//   const ui = ensureProgressUI();
//   if (!ui) return;

//   const clamped = Math.max(0, Math.min(100, pct));
//   ui.bar.style.width = `${clamped}%`;
//   ui.label.textContent = text ? `${text} (${clamped.toFixed(0)}%)` : `${clamped.toFixed(0)}%`;
// }

// // yield to browser to update UI
// function nextFrame() {
//   return new Promise(res => requestAnimationFrame(() => res()));
// }

// // ============================================================
// // Stats
// // ============================================================
// function setupMiniStats(viewerEl) {
//   const container = document.getElementById('stats-output');
//   if (!container) return;
//   const stats = new Stats();
//   stats.dom.style.position = 'relative';
//   stats.dom.style.top = 'auto';
//   stats.dom.style.left = 'auto';
//   stats.dom.style.margin = '6px 0';
//   container.appendChild(stats.dom);
//   stats.showPanel(0);
//   stats.dom.title = 'Klicken: FPS → MS → RAM';
//   (function loop() {
//     stats.update();
//     requestAnimationFrame(loop);
//   })();
// }

// // ============================================================
// // Utilities
// // ============================================================
// function disposeGroup(g) {
//   if (!g) return;
//   g.traverse(c => {
//     if (c.geometry) c.geometry.dispose();
//     if (c.material) c.material.dispose();
//   });
// }

// function makeGroupNonPickable(group) {
//   if (!group) return;
//   group.traverse(obj => {
//     obj.raycast = () => null;
//   });
// }

// function findToolPoint(robot) {
//   let toolPoint = null;
//   robot.traverse(c => { if (c.name === 'tool_point') toolPoint = c; });
//   if (!toolPoint) robot.traverse(c => { if (c.isURDFLink && c.children.length === 0) toolPoint = c; });
//   return toolPoint;
// }

// function collectMovableJoints(robot) {
//   const movable = [];
//   robot.traverse(c => {
//     if (c.isURDFJoint && c.jointType !== 'fixed') {
//       const lo = (c.limit && Number.isFinite(c.limit.lower)) ? c.limit.lower : -Math.PI;
//       const hi = (c.limit && Number.isFinite(c.limit.upper)) ? c.limit.upper : Math.PI;
//       movable.push({
//         obj: c,
//         min: lo,
//         max: hi,
//         range: hi - lo,
//         initial: c.angle
//       });
//     }
//   });
//   return movable;
// }

// // Pose Snapshot/Restore (für Freeze + Endpose)
// function snapshotJointPose(movableJoints) {
//   const snap = new Map();
//   for (const mj of movableJoints) snap.set(mj.obj.name, mj.obj.angle);
//   return snap;
// }

// function applyJointPose(movableJoints, snap) {
//   for (const mj of movableJoints) {
//     const a = snap.get(mj.obj.name);
//     if (a !== undefined) mj.obj.setJointValue(a);
//   }
// }

// function getFirstMovableJoint(robot) {
//   let first = null;
//   robot.traverse(c => {
//     if (!first && c.isURDFJoint && c.jointType !== 'fixed') first = c;
//   });
//   return first;
// }

// function getFirstJointWorldOrigin(robot) {
//   const first = getFirstMovableJoint(robot);
//   const o = new THREE.Vector3();
//   if (first) first.getWorldPosition(o);
//   else robot.getWorldPosition(o);
//   return o;
// }

// /**
//  * Basis aus erster Gelenkachse:
//  * z' = axis des ersten beweglichen Joints (world)
//  * x' = world X projiziert auf Ebene ⟂ z'
//  * y' = z' × x'
//  */
// function buildBasisFromFirstJoint(robot) {
//   robot.updateMatrixWorld(true);

//   const joint = getFirstMovableJoint(robot);
//   const origin = getFirstJointWorldOrigin(robot);

//   let zAxis = new THREE.Vector3(0, 1, 0);
//   if (joint && joint.axis) {
//     zAxis = joint.axis.clone().transformDirection(joint.matrixWorld).normalize();
//   }

//   const worldX = new THREE.Vector3(1, 0, 0);
//   const worldZ = new THREE.Vector3(0, 0, 1);

//   let xAxis = worldX.clone().sub(zAxis.clone().multiplyScalar(worldX.dot(zAxis)));
//   if (xAxis.lengthSq() < 1e-8) {
//     xAxis = worldZ.clone().sub(zAxis.clone().multiplyScalar(worldZ.dot(zAxis)));
//   }
//   xAxis.normalize();

//   const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

//   return { origin, basis: { x: xAxis, y: yAxis, z: zAxis } };
// }

// /** World -> local basis coordinates (x',y',z') relative to origin */
// function toBasisCoords(pWorld, origin, basis) {
//   const v = new THREE.Vector3().subVectors(pWorld, origin);
//   return new THREE.Vector3(
//     v.dot(basis.x),
//     v.dot(basis.y),
//     v.dot(basis.z),
//   );
// }

// /** local basis coords -> world */
// function fromBasisCoords(pLocal, origin, basis) {
//   const out = new THREE.Vector3().copy(origin);
//   out.addScaledVector(basis.x, pLocal.x);
//   out.addScaledVector(basis.y, pLocal.y);
//   out.addScaledVector(basis.z, pLocal.z);
//   return out;
// }

// function buildPointCloud(points, { color = 0xffff00, size = 0.01, opacity = 0.9 } = {}) {
//   const positions = new Float32Array(points.length * 3);
//   for (let i = 0; i < points.length; i++) {
//     positions[i * 3 + 0] = points[i].x;
//     positions[i * 3 + 1] = points[i].y;
//     positions[i * 3 + 2] = points[i].z;
//   }

//   const geo = new THREE.BufferGeometry();
//   geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

//   const mat = new THREE.PointsMaterial({
//     color,
//     size,
//     sizeAttenuation: true,
//     transparent: true,
//     opacity
//   });

//   return new THREE.Points(geo, mat);
// }

// function updatePointCloudGeometry(pointsObj, points) {
//   if (!pointsObj) return;

//   const positions = new Float32Array(points.length * 3);
//   for (let i = 0; i < points.length; i++) {
//     positions[i * 3 + 0] = points[i].x;
//     positions[i * 3 + 1] = points[i].y;
//     positions[i * 3 + 2] = points[i].z;
//   }

//   // dispose old geometry
//   if (pointsObj.geometry) pointsObj.geometry.dispose();

//   const geo = new THREE.BufferGeometry();
//   geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
//   pointsObj.geometry = geo;
//   pointsObj.geometry.computeBoundingSphere?.();
// }

// function setInnerVisibility(visible) {
//   if (innerShellObject) innerShellObject.visible = visible;
//   if (innerNormalsObject) innerNormalsObject.visible = visible;
//   viewer.redraw();
// }

// // ============================================================
// // Slice Slider UI (persistent; does NOT auto-disappear)
// // ============================================================
// function ensureSliceUI() {
//   if (sliceUI && sliceUI.wrap?.isConnected) return sliceUI;

//   const wrap = document.createElement('div');
//   wrap.id = 'slice-slider-ui';
//   wrap.style.position = 'fixed';
//   wrap.style.left = '12px';
//   wrap.style.bottom = '12px';
//   wrap.style.zIndex = '9999';
//   wrap.style.background = 'rgba(0,0,0,0.55)';
//   wrap.style.backdropFilter = 'blur(6px)';
//   wrap.style.border = '1px solid rgba(255,255,255,0.2)';
//   wrap.style.borderRadius = '10px';
//   wrap.style.padding = '10px 12px';
//   wrap.style.display = 'none';
//   wrap.style.minWidth = '260px';
//   wrap.style.color = '#fff';
//   wrap.style.font = '12px/1.2 system-ui, sans-serif';

//   const title = document.createElement('div');
//   title.textContent = 'Slice Viewer';
//   title.style.fontWeight = '600';
//   title.style.marginBottom = '6px';

//   const row = document.createElement('div');
//   row.style.display = 'flex';
//   row.style.gap = '10px';
//   row.style.alignItems = 'center';

//   const label = document.createElement('div');
//   label.textContent = 'Layer: 0 / 0';
//   label.style.opacity = '0.9';
//   label.style.minWidth = '95px';

//   const input = document.createElement('input');
//   input.type = 'range';
//   input.min = '0';
//   input.max = '0';
//   input.step = '1';
//   input.value = '0';
//   input.style.width = '160px';

//   const hint = document.createElement('div');
//   hint.textContent = 'Zeigt nur Punkte in der gewählten Schicht.';
//   hint.style.opacity = '0.75';
//   hint.style.marginTop = '6px';

//   row.appendChild(label);
//   row.appendChild(input);
//   wrap.appendChild(title);
//   wrap.appendChild(row);
//   wrap.appendChild(hint);

//   sliceSliderHost.appendChild(wrap);

//   sliceUI = { wrap, label, input, hint };
//   return sliceUI;
// }



// function showSliceUI(layers) {
//   const ui = ensureSliceUI();
//   ui.input.min = '0';
//   ui.input.max = String(Math.max(0, layers - 1));
//   ui.input.value = String(Math.min(currentSliceIndex, layers - 1));
//   ui.wrap.style.display = 'block';
//   ui.label.textContent = `Layer: ${ui.input.value} / ${layers - 1}`;
//   return ui;
// }

// function hideSliceUI() {
//   if (!sliceUI) return;
//   sliceUI.wrap.style.display = 'none';
// }

// // ============================================================
// // Workspace Sampling + Slicing (+/- 1% Band)
// // ============================================================

// /**
//  * Random Punktwolke durch beliebige Achsbewegungen:
//  * pro sample:
//  *  - random joint values
//  *  - record TCP position (tool_point)
//  */
// async function sampleWorkspacePointCloud(viewerEl, config) {
//   const robot = viewerEl.robot;
//   const toolPoint = findToolPoint(robot);
//   if (!toolPoint) throw new Error('Kein tool_point / Endeffektor-Link gefunden.');

//   const movableJoints = collectMovableJoints(robot);
//   if (!movableJoints.length) throw new Error('Keine beweglichen Joints gefunden.');

//   const poseAtButtonPress = snapshotJointPose(movableJoints);

//   const pts = []; // Vector3 world positions only
//   const pos = new THREE.Vector3();

//   const total = config.samples;
//   const chunk = Math.max(200, config.sampleChunk | 0);

//   console.time('Workspace: Sampling');

//   for (let i = 0; i < total; i++) {
//     if (samplingAborted) break;

//     for (let j = 0; j < movableJoints.length; j++) {
//       const mj = movableJoints[j];
//       mj.obj.setJointValue(mj.min + Math.random() * (mj.range || 1));
//     }

//     robot.updateMatrixWorld(true);

//     toolPoint.getWorldPosition(pos);
//     pts.push(pos.clone());

//     if ((i + 1) % chunk === 0) {
//       // Freeze
//       applyJointPose(movableJoints, poseAtButtonPress);
//       robot.updateMatrixWorld(true);

//       const pct = (i + 1) / total * 80;
//       setProgress(pct, 'Sampling');
//       await nextFrame();
//     }
//   }

//   // Endpose
//   applyJointPose(movableJoints, poseAtButtonPress);
//   robot.updateMatrixWorld(true);

//   console.timeEnd('Workspace: Sampling');

//   return pts;
// }

// /**
//  * Slice point cloud from "top to bottom" along z' (first joint axis),
//  * keep points within +- tolPct of each slice plane thickness.
//  *
//  * Interpretation:
//  * - compute zMin..zMax in basis coords
//  * - slices = n layers
//  * - each layer has center zc
//  * - keep point if |z - zc| <= tolPct * dz
//  */
// function slicePointCloudBand(pointsWorld, meta, { layers = 50, tolPct = 0.01 } = {}) {
//   const { origin, basis } = meta;

//   // local z min/max
//   let zMin = +Infinity;
//   let zMax = -Infinity;

//   const local = new Array(pointsWorld.length);
//   for (let i = 0; i < pointsWorld.length; i++) {
//     const l = toBasisCoords(pointsWorld[i], origin, basis);
//     local[i] = l;
//     if (l.z < zMin) zMin = l.z;
//     if (l.z > zMax) zMax = l.z;
//   }

//   const span = Math.max(1e-9, zMax - zMin);
//   const dz = span / layers;
//   const band = Math.max(1e-9, tolPct * dz);

//   const slices = Array.from({ length: layers }, (_, k) => ({
//     layerIndex: k,
//     zCenter: zMin + (k + 0.5) * dz,
//     indices: []
//   }));

//   for (let i = 0; i < local.length; i++) {
//     const z = local[i].z;

//     // nearest slice center
//     let k = Math.floor((z - zMin) / dz);
//     if (k < 0) k = 0;
//     if (k >= layers) k = layers - 1;

//     const zc = slices[k].zCenter;
//     if (Math.abs(z - zc) <= band) {
//       slices[k].indices.push(i);
//     }
//   }

//   return { slices, zMin, zMax, dz, band, local };
// }

// // ============================================================
// // Slice Viewer Rendering
// // ============================================================
// function ensureSlicePointsGroup(viewerEl) {
//   if (slicePointsGroup) return slicePointsGroup;

//   slicePointsGroup = new THREE.Group();
//   slicePointsGroup.name = 'slicePointsGroup';

//   // create initial points object
//   slicePointCloudObject = buildPointCloud([], {
//     color: 0xffffff,
//     size: 0.01,
//     opacity: 0.9
//   });

//   slicePointsGroup.add(slicePointCloudObject);
//   viewerEl.scene.add(slicePointsGroup);
//   makeGroupNonPickable(slicePointsGroup);
//   return slicePointsGroup;
// }

// function clearSliceViewer(viewerEl) {
//   if (slicePointsGroup) {
//     viewerEl.scene.remove(slicePointsGroup);
//     disposeGroup(slicePointsGroup);
//     slicePointsGroup = null;
//     slicePointCloudObject = null;
//   }
//   hideSliceUI();
// }

// function showSlice(viewerEl, sliceIndex) {
//   if (!cachedPointCloud?.sliceData?.slices?.length) return;

//   const { pointsWorld, sliceData, origin, basis } = cachedPointCloud;
//   const layers = sliceData.slices.length;

//   currentSliceIndex = Math.max(0, Math.min(layers - 1, sliceIndex));

//   const sl = sliceData.slices[currentSliceIndex];
//   const zc = sl.zCenter;

//   // NEW: flatten points onto slice mid-plane (z = zCenter in basis coords)
//   const pts = sl.indices.map(i => {
//     const l = sliceData.local[i]; // Vector3 in basis coords (x',y',z')
//     // set z to slice center => all points lie on one plane
//     return fromBasisCoords(new THREE.Vector3(l.x, l.y, zc), origin, basis);
//   });

//   ensureSlicePointsGroup(viewerEl);
//   updatePointCloudGeometry(slicePointCloudObject, pts);
//   viewerEl.redraw();

//   const ui = ensureSliceUI();
//   ui.label.textContent = `Layer: ${currentSliceIndex} / ${layers - 1}  (${pts.length} pts)`;
//   ui.input.value = String(currentSliceIndex);
// }


// // ============================================================
// // MAIN: Generate random point cloud + slice + show slider + slice view
// // ============================================================
// export async function generateAndShowSlicedPointCloud(viewerEl, options = {}) {
//   if (!viewerEl.robot) return null;

//   isSampling = true;
//   samplingAborted = false;

//   const config = {
//     // sampling
//     samples: 800000,
//     sampleChunk: 2500,

//     // slicing
//     layers: 60,
//     tolPct: 0.01,

//     // display
//     pointSize: 0.01,
//     pointOpacity: 0.9,

//     ...options
//   };

//   showProgress();
//   await nextFrame();

//   // remove previous visuals
//   if (hullGroup) {
//     viewerEl.scene.remove(hullGroup);
//     disposeGroup(hullGroup);
//     hullGroup = null;
//   }
//   cachedHullGroup = null;
//   cachedShellData = null;

//   clearSliceViewer(viewerEl);

//   // meta basis/origin
//   const meta = buildBasisFromFirstJoint(viewerEl.robot);

//   // 1) sample
//   setProgress(0, 'Sampling');
//   await nextFrame();

//   let pointsWorld = [];
//   try {
//     pointsWorld = await sampleWorkspacePointCloud(viewerEl, config);
//   } catch (e) {
//     console.error(e);
//     hideProgress();
//     isSampling = false;
//     return null;
//   }

//   if (samplingAborted || pointsWorld.length === 0) {
//     hideProgress();
//     isSampling = false;
//     return null;
//   }

//   // 2) slice (+/- 1%)
//   setProgress(85, 'Slicing');
//   await nextFrame();

//   console.time('Workspace: Slicing');
//   const sliceData = slicePointCloudBand(pointsWorld, meta, {
//     layers: config.layers,
//     tolPct: config.tolPct
//   });
//   console.timeEnd('Workspace: Slicing');

//   // cache
//   cachedPointCloud = {
//     ...meta,
//     pointsWorld,
//     sliceData
//   };

//   const flattenedPointsWorld = pointsWorld.map((p, i) => {
//   const l = sliceData.local[i];
//   // Slice-Index wie in slicePointCloudBand:
//   let k = Math.floor((l.z - sliceData.zMin) / sliceData.dz);
//   if (k < 0) k = 0;
//   if (k >= sliceData.slices.length) k = sliceData.slices.length - 1;
//   const zc = sliceData.slices[k].zCenter;
//   return fromBasisCoords(new THREE.Vector3(l.x, l.y, zc), meta.origin, meta.basis);
// });

//   // Automatischer Export der Schichten
//   console.log('🔄 Exportiere Schichten...');
//   exportSlicesToPLY(sliceData, flattenedPointsWorld, meta, 'workspace_slices.ply');
//   // exportSlicesWithMetadata(sliceData, pointsWorld, meta, 'workspace_slices_detailed.ply');

//   // 3) show UI + render first slice
//   setProgress(98, 'UI');
//   await nextFrame();

//   const ui = showSliceUI(sliceData.slices.length);

//   // Update slice point size/opacity if desired
//   ensureSlicePointsGroup(viewerEl);
//   if (slicePointCloudObject?.material) {
//     slicePointCloudObject.material.size = config.pointSize;
//     slicePointCloudObject.material.opacity = config.pointOpacity;
//     slicePointCloudObject.material.transparent = true;
//     slicePointCloudObject.material.needsUpdate = true;
//   }

//   // IMPORTANT: attach exactly once
//   if (!ui._wired) {
//     ui.input.addEventListener('input', () => {
//       const idx = parseInt(ui.input.value, 10) || 0;
//       showSlice(viewerEl, idx);
//     });
//     ui._wired = true;
//   }

//   // show initial slice
//   showSlice(viewerEl, 0);

//   setProgress(100, 'Fertig');
//   await nextFrame();
//   setTimeout(() => hideProgress(), 250);

//   isSampling = false;
//   return cachedPointCloud;
// }

// // ============================================================
// // UI wiring (existing toggles)
// // ============================================================
// const setColor = color => {
//   document.body.style.backgroundColor = color;
//   viewer.highlightColor = '#' + (new THREE.Color(0xffffff)).lerp(new THREE.Color(color), 0.35).getHexString();
// };

// limitsToggle?.addEventListener('click', () => {
//   limitsToggle.classList.toggle('checked');
//   viewer.ignoreLimits = limitsToggle.classList.contains('checked');
// });

// radiansToggle?.addEventListener('click', () => {
//   radiansToggle.classList.toggle('checked');
//   Object.values(sliders).forEach(sl => sl.update());
// });

// collisionToggle?.addEventListener('click', () => {
//   collisionToggle.classList.toggle('checked');
//   viewer.showCollision = collisionToggle.classList.contains('checked');
//   viewer.redraw();
// });

// // Envelope Toggle: now triggers point cloud + slicing + slider
// envelopeToggle?.addEventListener('click', async () => {
//   envelopeToggle.classList.toggle('checked');

//   // stop animation while sampling
//   animToggle?.classList.remove('checked');

//   if (envelopeToggle.classList.contains('checked')) {
//     if (cachedPointCloud?.sliceData?.slices?.length) {
//       // already cached: just re-show UI and last slice
//       showSliceUI(cachedPointCloud.sliceData.slices.length);
//       showSlice(viewer, currentSliceIndex);
//     } else {
//       await generateAndShowSlicedPointCloud(viewer, {
//         samples: 8000000,  // adjust
//         layers: 100,        // adjust
//         tolPct: 0.25,
//         pointSize: 0.01,
//         pointOpacity: 0.9
//       });
//     }
//   } else {
//     samplingAborted = true;
//     clearSliceViewer(viewer);
//   }
// });

// // inner on/off (kept; not used in this minimal slice viewer)
// if (innerShellToggle) {
//   innerShellToggle.addEventListener('click', () => {
//     innerShellToggle.classList.toggle('checked');
//     const visible = innerShellToggle.classList.contains('checked');
//     setInnerVisibility(visible);
//   });
// }

// autocenterToggle?.addEventListener('click', () => {
//   autocenterToggle.classList.toggle('checked');
//   viewer.noAutoRecenter = !autocenterToggle.classList.contains('checked');
// });

// hideFixedToggle?.addEventListener('click', () => {
//   hideFixedToggle.classList.toggle('checked');
//   const hideFixed = hideFixedToggle.classList.contains('checked');
//   if (hideFixed) controlsel.classList.add('hide-fixed');
//   else controlsel.classList.remove('hide-fixed');
// });

// upSelect?.addEventListener('change', () => viewer.up = upSelect.value);
// controlsToggle?.addEventListener('click', () => controlsel.classList.toggle('hidden'));

// viewer.addEventListener('urdf-change', () => {
//   // clear workspace visuals
//   if (hullGroup) {
//     viewer.scene.remove(hullGroup);
//     disposeGroup(hullGroup);
//   }
//   hullGroup = null;
//   cachedHullGroup = null;
//   cachedShellData = null;

//   cachedPointCloud = null;
//   currentSliceIndex = 0;
//   clearSliceViewer(viewer);

//   envelopeToggle?.classList.remove('checked');
//   if (innerShellToggle) innerShellToggle.style.display = 'none';
//   if (exportToggle) exportToggle.style.display = 'none';

//   Object.values(sliders).forEach(sl => sl.remove());
//   sliders = {};
// });

// viewer.addEventListener('ignore-limits-change', () => {
//   Object.values(sliders).forEach(sl => sl.update());
// });

// viewer.addEventListener('angle-change', e => {
//   if (e && e.detail && sliders[e.detail]) sliders[e.detail].update();
//   else Object.values(sliders).forEach(sl => sl.update());
// });

// viewer.addEventListener('joint-mouseover', e => {
//   const j = document.querySelector(`li[joint-name="${e.detail}"]`);
//   if (j) j.setAttribute('robot-hovered', true);
// });

// viewer.addEventListener('joint-mouseout', e => {
//   const j = document.querySelector(`li[joint-name="${e.detail}"]`);
//   if (j) j.removeAttribute('robot-hovered');
// });

// let originalNoAutoRecenter;
// viewer.addEventListener('manipulate-start', e => {
//   const j = document.querySelector(`li[joint-name="${e.detail}"]`);
//   if (j) {
//     j.scrollIntoView({ block: 'nearest' });
//     window.scrollTo(0, 0);
//   }
//   originalNoAutoRecenter = viewer.noAutoRecenter;
//   viewer.noAutoRecenter = true;
// });

// viewer.addEventListener('manipulate-end', () => {
//   viewer.noAutoRecenter = originalNoAutoRecenter;
// });

// // ============================================================
// // Slider UI (existing joint sliders - unchanged)
// // ============================================================
// viewer.addEventListener('urdf-processed', () => {
//   const r = viewer.robot;
//   Object
//     .keys(r.joints)
//     .sort((a, b) => {
//       const da = a.split(/[^\d]+/g).filter(v => !!v).pop();
//       const db = b.split(/[^\d]+/g).filter(v => !!v).pop();

//       if (da !== undefined && db !== undefined) {
//         const delta = parseFloat(da) - parseFloat(db);
//         if (delta !== 0) return delta;
//       }

//       if (a > b) return 1;
//       if (b > a) return -1;
//       return 0;
//     })
//     .map(key => r.joints[key])
//     .forEach(joint => {
//       if (joint.jointType === 'prismatic' && Array.isArray(joint.mimicJoints) && joint.mimicJoints.length == 0) {
//         console.log(`Skip slider for mimic prismatic joint: ${joint.name}`);
//         return;
//       }

//       const li = document.createElement('li');
//       li.innerHTML = `
//         <span title="${joint.name}">${joint.name}</span>
//         <input type="range" value="0" step="0.0001"/>
//         <input type="number" step="0.0001" />
//       `;
//       li.setAttribute('joint-type', joint.jointType);
//       li.setAttribute('joint-name', joint.name);

//       sliderList.appendChild(li);

//       const slider = li.querySelector('input[type="range"]');
//       const input = li.querySelector('input[type="number"]');

//       li.update = () => {
//         const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : RAD2DEG;
//         let angle = joint.angle;

//         if (joint.jointType === 'revolute' || joint.jointType === 'continuous') angle *= degMultiplier;

//         if (Math.abs(angle) > 1) angle = angle.toFixed(1);
//         else angle = angle.toPrecision(2);

//         input.value = parseFloat(angle);
//         slider.value = joint.angle;

//         if (viewer.ignoreLimits || joint.jointType === 'continuous') {
//           slider.min = -6.28;
//           slider.max = 6.28;
//           input.min = -6.28 * degMultiplier;
//           input.max = 6.28 * degMultiplier;
//         } else {
//           slider.min = joint.limit.lower;
//           slider.max = joint.limit.upper;
//           input.min = joint.limit.lower * degMultiplier;
//           input.max = joint.limit.upper * degMultiplier;
//         }
//       };

//       switch (joint.jointType) {
//         case 'continuous':
//         case 'prismatic':
//         case 'revolute':
//           break;
//         default:
//           li.update = () => {};
//           input.remove();
//           slider.remove();
//       }

//       slider.addEventListener('input', () => {
//         viewer.setJointValue(joint.name, slider.value);
//         li.update();
//       });

//       input.addEventListener('change', () => {
//         const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : DEG2RAD;
//         viewer.setJointValue(joint.name, input.value * degMultiplier);
//         li.update();
//       });

//       li.update();
//       sliders[joint.name] = li;
//     });
// });

// // ============================================================
// // Loader + Drag&Drop (unchanged)
// // ============================================================
// document.addEventListener('WebComponentsReady', () => {
//   viewer.loadMeshFunc = (path, manager, done) => {
//     const ext = path.split(/\./g).pop().toLowerCase();
//     switch (ext) {
//       case 'gltf':
//       case 'glb':
//         new GLTFLoader(manager).load(path, result => done(result.scene), null, err => done(null, err));
//         break;
//       case 'obj':
//         new OBJLoader(manager).load(path, result => done(result), null, err => done(null, err));
//         break;
//       case 'dae':
//         new ColladaLoader(manager).load(path, result => done(result.scene), null, err => done(null, err));
//         break;
//       case 'stl':
//         new STLLoader(manager).load(
//           path,
//           result => {
//             const material = new THREE.MeshPhongMaterial();
//             const mesh = new THREE.Mesh(result, material);
//             done(mesh);
//           },
//           null,
//           err => done(null, err),
//         );
//         break;
//     }
//   };

//   document.querySelector('li[urdf]')?.dispatchEvent(new Event('click'));

//   if (/javascript\/example\/bundle/i.test(window.location)) {
//     viewer.package = '../../../urdf';
//   }

//   registerDragEvents(viewer, () => {
//     setColor('#263238');
//     animToggle.classList.remove('checked');
//     updateList();
//   }, () => {
//     if (hullGroup) {
//       viewer.scene.remove(hullGroup);
//       disposeGroup(hullGroup);
//       hullGroup = null;
//     }
//     cachedHullGroup = null;
//     cachedShellData = null;

//     cachedPointCloud = null;
//     currentSliceIndex = 0;
//     clearSliceViewer(viewer);

//     if (innerShellToggle) innerShellToggle.style.display = 'none';
//     if (exportToggle) exportToggle.style.display = 'none';
//     envelopeToggle.classList.remove('checked');
//   });
// });

// // ============================================================
// // Animation (unchanged)
// // ============================================================
// const updateAngles = () => {
//   if (!viewer.setJointValue || !viewer.robot || !viewer.robot.joints) return;

//   const time = Date.now() / 3e2;
//   for (let i = 1; i <= 6; i++) {
//     const offset = i * Math.PI / 3;
//     const ratio = Math.max(0, Math.sin(time + offset));
//     viewer.setJointValue(`HP${i}`, THREE.MathUtils.lerp(30, 0, ratio) * DEG2RAD);
//     viewer.setJointValue(`KP${i}`, THREE.MathUtils.lerp(90, 150, ratio) * DEG2RAD);
//     viewer.setJointValue(`AP${i}`, THREE.MathUtils.lerp(-30, -60, ratio) * DEG2RAD);
//     viewer.setJointValue(`TC${i}A`, THREE.MathUtils.lerp(0, 0.065, ratio));
//     viewer.setJointValue(`TC${i}B`, THREE.MathUtils.lerp(0, 0.065, ratio));
//     viewer.setJointValue(`W${i}`, window.performance.now() * 0.001);
//   }
// };

// const updateLoop = () => {
//   if (animToggle.classList.contains('checked')) updateAngles();
//   requestAnimationFrame(updateLoop);
// };

// const updateList = () => {
//   document.querySelectorAll('#urdf-options li[urdf]').forEach(el => {
//     el.addEventListener('click', e => {
//       const urdf = e.target.getAttribute('urdf');
//       const color = e.target.getAttribute('color');

//       if (hullGroup) {
//         viewer.scene.remove(hullGroup);
//         disposeGroup(hullGroup);
//         hullGroup = null;
//       }
//       cachedHullGroup = null;
//       cachedShellData = null;

//       cachedPointCloud = null;
//       currentSliceIndex = 0;
//       clearSliceViewer(viewer);

//       if (innerShellToggle) innerShellToggle.style.display = 'none';
//       if (exportToggle) exportToggle.style.display = 'none';
//       envelopeToggle.classList.remove('checked');

//       viewer.up = '+Z';
//       document.getElementById('up-select').value = viewer.up;

//       viewer.urdf = urdf;
//       animToggle.classList.add('checked');
//       setColor(color);
//     });
//   });
// };

// updateList();

// document.addEventListener('WebComponentsReady', () => {
//   animToggle.addEventListener('click', () => animToggle.classList.toggle('checked'));
//   viewer.addEventListener('manipulate-start', () => animToggle.classList.remove('checked'));
//   viewer.addEventListener('urdf-processed', () => updateAngles());
//   updateLoop();

//   viewer.camera.position.set(-5.5, 3.5, 5.5);
//   autocenterToggle.classList.remove('checked');
//   viewer.noAutoRecenter = true;
// });


/* globals */
import * as THREE from 'three';
import { registerDragEvents } from './dragAndDrop.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import URDFManipulator from 'urdf-loader/src/urdf-manipulator-element.js';
import URDFIKManipulator from './URDFIKManipulator.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

customElements.define('urdf-viewer', URDFIKManipulator);

let WS = null;

// Wird ausgelöst, sobald functionalities.js den Socket erstellt hat
window.addEventListener("ws-ready", (e) => {
  WS = e.detail.socket;
  console.log("[index.js] WS ready:", WS?.readyState);

  // ✅ Listener nur einmal registrieren
  attachWsProcessingDoneHandler();
});

// Fallback: falls Event verpasst wird (z.B. Reload Race)
function getWS() {
  return WS || window.__WS_PCD__ || null;
}


const viewer = document.querySelector('urdf-viewer');
setupMiniStats(viewer);

// --- UI elements (existing) ---
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

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 1 / DEG2RAD;

let sliders = {};

// Sampling control flags
let isSampling = false;
let samplingAborted = false;

let workspaceAbortController = null;
let workspaceSeqInFlight = null;

function createAbortError(message = 'Aborted') {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

// Workspace resolution presets
const WORKSPACE_RES = {
  low: { samples: 1_000_000, voxel_size: 0.02 },
  medium: { samples: 4_000_000, voxel_size: 0.015 },
  high: { samples: 8_000_000, voxel_size: 0.01 },
};
let workspaceResolution = 'medium';

function setResolutionUI(value) {
  workspaceResolution = value in WORKSPACE_RES ? value : 'medium';
  resolutionGroup?.querySelectorAll('.seg-btn')?.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.res === workspaceResolution);
  });

  const idx = workspaceResolution === 'low' ? 0 : workspaceResolution === 'high' ? 2 : 1;
  resolutionGroup?.style?.setProperty('--seg-index', String(idx));
}

setResolutionUI(workspaceResolution);

// RAW point cloud cache + display
let cachedPointCloud = null; // legacy/other features
let cachedSurfacePointCloud = null; // { pointsWorld:[Vector3] }
let pointCloudGroup = null;
let pointCloudObject = null;
let surfaceCloudVisible = !!envelopeToggle?.classList.contains('checked');

// ============================================================
// Minimal Progress UI (DOM) – keine externen CSS-Abhängigkeiten
// ============================================================
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
  setProgress(0, 'Initialisiere…');
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

// expose progress controls for other modules (functionalities.js)
window.__WS_PROGRESS__ = {
  show: showProgress,
  hide: hideProgress,
  set: setProgress,
};

function nextFrame() {
  return new Promise(res => requestAnimationFrame(() => res()));
}

// ============================================================
// WS: Ende erkennen (surface_done) -> Progress beenden
// ============================================================
let _wsDoneHandlerAttached = false;

function attachWsProcessingDoneHandler() {
  const ws = getWS();
  if (!ws) return;
  if (_wsDoneHandlerAttached) return;
  _wsDoneHandlerAttached = true;

  ws.addEventListener("message", (ev) => {
    if (typeof ev.data !== "string") return;

    // Backend signalisiert: Surface vollständig gesendet
    if (ev.data.startsWith("surface_done|")) {
      setProgress(100, "Fertig");
      setTimeout(() => hideProgress(), 300);
    }
  });
}

// ============================================================
// Stats
// ============================================================
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

// ============================================================
// Utilities
// ============================================================
function disposeGroup(g) {
  if (!g) return;
  g.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
  });
}

function makeGroupNonPickable(group) {
  if (!group) return;
  group.traverse(obj => {
    obj.raycast = () => null;
  });
}

function findToolPoint(robot) {
  let toolPoint = null;
  robot.traverse(c => { if (c.name === 'tool_point') toolPoint = c; });
  if (!toolPoint) robot.traverse(c => { if (c.isURDFLink && c.children.length === 0) toolPoint = c; });
  return toolPoint;
}

function collectMovableJoints(robot) {
  const movable = [];
  robot.traverse(c => {
    if (c.isURDFJoint && c.jointType !== 'fixed') {
      const lo = (c.limit && Number.isFinite(c.limit.lower)) ? c.limit.lower : -Math.PI;
      const hi = (c.limit && Number.isFinite(c.limit.upper)) ? c.limit.upper : Math.PI;
      movable.push({
        obj: c,
        min: lo,
        max: hi,
        range: hi - lo,
      });
    }
  });
  return movable;
}

function snapshotJointPose(movableJoints) {
  const snap = new Map();
  for (const mj of movableJoints) snap.set(mj.obj.name, mj.obj.angle);
  return snap;
}

function applyJointPose(movableJoints, snap) {
  for (const mj of movableJoints) {
    const a = snap.get(mj.obj.name);
    if (a !== undefined) mj.obj.setJointValue(a);
  }
}

function makeCircleSpriteTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ============================================================
// Point cloud rendering (RAW)
// ============================================================
const CIRCLE_TEX = makeCircleSpriteTexture(64);

function buildPointCloud(points, { size = 0.006, opacity = 0.45 } = {}) {
  const positions = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    positions[i * 3 + 0] = points[i].x;
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
  for (let i = 0; i < points.length; i++) {
    positions[i * 3 + 0] = points[i].x;
    positions[i * 3 + 1] = points[i].y;
    positions[i * 3 + 2] = points[i].z;
  }

  if (pointsObj.geometry) pointsObj.geometry.dispose();

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
    viewerEl.redraw();
    return;
  }
  if (surfaceCloudVisible) {
    // re-show cached points without reloading
    showRawPointCloud(viewerEl, cachedSurfacePointCloud.pointsWorld, { size: 0.01, opacity: 0.9 });
  } else {
    clearPointCloud(viewerEl);
    viewerEl.redraw();
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

  viewerEl.redraw();
}

// Export for use in functionalities.js
window.showRawPointCloud = showRawPointCloud;

// ========= PointCloud Binary Protocol (PCD2) =========
const PCD_HEADER_BYTES = 52;

function computeBBox(points) {
  let minx = Infinity, miny = Infinity, minz = Infinity;
  let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (const p of points) {
    const x = p.x, y = p.y, z = p.z;
    if (x < minx) minx = x; if (y < miny) miny = y; if (z < minz) minz = z;
    if (x > maxx) maxx = x; if (y > maxy) maxy = y; if (z > maxz) maxz = z;
  }
  return { minx, miny, minz, maxx, maxy, maxz };
}

function makeSeqId() {
  return (Math.random() * 0xFFFFFFFF) >>> 0;
}

/**
 * Async + UI-friendly sending
 */
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
    console.warn("[PCD2] websocket not open");
    return null;
  }
  ws.binaryType = "arraybuffer";

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

  console.log(`[PCD2] send seq=${seqId} points=${totalPoints} chunks=${chunkCount}`);

  if (typeof onSeqId === 'function') {
    try { onSeqId(seqId); } catch { /* ignore */ }
  }

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    if (signal?.aborted || samplingAborted) {
      throw createAbortError('Upload aborted');
    }
    const startIndex = chunkIndex * chunkPoints;
    const end = Math.min(startIndex + chunkPoints, totalPoints);
    const n = (end - startIndex) >>> 0;

    const dataBytes = n * 3 * 2;
    const buf = new ArrayBuffer(PCD_HEADER_BYTES + dataBytes);
    const dv = new DataView(buf);

    // magic "PCD2"
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

    for (let i = startIndex; i < end; i++) {
      const p = pointsWorld[i];
      const qx = Math.max(0, Math.min(65535, Math.round((p.x - minx) / scalex)));
      const qy = Math.max(0, Math.min(65535, Math.round((p.y - miny) / scaley)));
      const qz = Math.max(0, Math.min(65535, Math.round((p.z - minz) / scalez)));

      dv.setUint16(off + 0, qx, true);
      dv.setUint16(off + 2, qy, true);
      dv.setUint16(off + 4, qz, true);
      off += 6;
    }

    ws.send(buf);

    if (onLocalProgress) onLocalProgress(chunkIndex + 1, chunkCount);

    if (((chunkIndex + 1) % yieldEveryChunks) === 0) {
      await nextFrame();
      if (signal?.aborted || samplingAborted) {
        throw createAbortError('Upload aborted');
      }
    }
  }

  return { seqId, totalPoints, chunkCount };
}

export async function sampleAndSendWorkspacePointCloud(viewerEl, ws, {
  samples = 8000000,
  sampleChunk = 2500,
  sendChunkPoints = 200000,
  yieldEverySendChunks = 1,
  onSendProgress = null,
} = {}) {
  const config = { samples, sampleChunk };

  // 1) sample points (no render)
  const pointsWorld = await sampleWorkspacePointCloud(viewerEl, config);

  // 2) send points
  const meta = await sendPointCloudQuant16ChunkedAsync(ws, pointsWorld, {
    chunkPoints: sendChunkPoints,
    yieldEveryChunks: yieldEverySendChunks,
    onLocalProgress: onSendProgress,
  });

  return meta;
}

// ============================================================
// Monte Carlo Sampling: random joint configs -> TCP world pos
// ============================================================
async function sampleWorkspacePointCloud(viewerEl, config) {
  const robot = viewerEl.robot;
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

  for (let i = 0; i < total; i++) {
    if (samplingAborted) break;

    for (let j = 0; j < movableJoints.length; j++) {
      const mj = movableJoints[j];
      mj.obj.setJointValue(mj.min + Math.random() * (mj.range || 1));
    }

    robot.updateMatrixWorld(true);

    toolPoint.getWorldPosition(pos);
    pts.push(pos.clone());

    if ((i + 1) % chunk === 0) {
      applyJointPose(movableJoints, poseAtButtonPress);
      robot.updateMatrixWorld(true);

      const pct = (i + 1) / total * 95;
      setProgress(pct, 'Sampling');
      await nextFrame();
    }
  }

  applyJointPose(movableJoints, poseAtButtonPress);
  robot.updateMatrixWorld(true);

  console.timeEnd('Workspace: Sampling');

  return pts;
}

// ============================================================
// UI wiring (existing toggles)
// ============================================================
const setColor = color => {
  document.body.style.backgroundColor = color;
  viewer.highlightColor = '#' + (new THREE.Color(0xffffff)).lerp(new THREE.Color(color), 0.35).getHexString();
};

limitsToggle?.addEventListener('click', () => {
  limitsToggle.classList.toggle('checked');
  viewer.ignoreLimits = limitsToggle.classList.contains('checked');
});

radiansToggle?.addEventListener('click', () => {
  radiansToggle.classList.toggle('checked');
  Object.values(sliders).forEach(sl => sl.update());
});

collisionToggle?.addEventListener('click', () => {
  collisionToggle.classList.toggle('checked');
  viewer.showCollision = collisionToggle.classList.contains('checked');
  viewer.redraw();
});

// Envelope Toggle: sampling -> send. Progress:
// - sampling updates (0..95%)
// - after sampling: show "Processing" and hold
// - hide only when backend sends "surface_done|..."
envelopeToggle?.addEventListener('click', async () => {
  envelopeToggle.classList.toggle('checked');
  animToggle?.classList.remove('checked');

  surfaceCloudVisible = envelopeToggle.classList.contains('checked');

  const ws = getWS();

  if (!surfaceCloudVisible) {
    samplingAborted = true;
    try { workspaceAbortController?.abort(); } catch { /* ignore */ }
    workspaceAbortController = null;

    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        if (workspaceSeqInFlight !== null) ws.send(`pcd_abort|seq=${workspaceSeqInFlight}`);
        else ws.send('pcd_abort');
      } catch { /* ignore */ }
    }
    workspaceSeqInFlight = null;
    isSampling = false;

    // Keep cachedSurfacePointCloud so we can instantly re-show it on the next click.
    hideProgress();
    applySurfaceCloudVisibility(viewer);
    return;
  }

  // If we already have a cached surface cloud, just show it
  if (cachedSurfacePointCloud?.pointsWorld?.length) {
    applySurfaceCloudVisibility(viewer);
    return;
  }

  if (!ws) {
    console.warn("[index.js] WebSocket not initialized yet (ws-ready not received).");
    return;
  }
  if (ws.readyState !== WebSocket.OPEN) {
    console.warn("[index.js] WebSocket not OPEN yet. state=", ws.readyState);
    return;
  }

  const resCfg = WORKSPACE_RES[workspaceResolution] || WORKSPACE_RES.medium;
  ws.send(`pcd_cfg|voxel_size=${resCfg.voxel_size}`);

  samplingAborted = false;
  isSampling = true;
  workspaceSeqInFlight = null;
  workspaceAbortController = new AbortController();

  // ✅ progress visible during sampling
  showProgress();
  setProgress(0, "Sampling");
  await nextFrame();

  // ensure message handler attached (in case ws-ready race)
  attachWsProcessingDoneHandler();

  try {
    await sampleAndSendWorkspacePointCloud(viewer, ws, {
      samples: resCfg.samples,
      sampleChunk: 2500,
      sendChunkPoints: 200000,
      // ✅ update SEND progress in status bar
      onSendProgress: (k, n) => {
        const pct = Math.round((k / n) * 100);
        setProgress(pct, "Sende Pointcloud an Backend");
      },
      onSeqId: (seqId) => {
        workspaceSeqInFlight = seqId;
      },
      signal: workspaceAbortController.signal,
    });

    // ✅ After sampling finished (bar is at ~95%), now hold and show "Processing"
    setProgress(100, "Upload fertig");
    await nextFrame();

    // do NOT hide here. Will hide on "surface_done|..."
  } catch (e) {
    if (e?.name === 'AbortError') {
      // stop requested by user
    } else {
      console.error(e);
    }
    hideProgress();
  } finally {
    isSampling = false;
  }
});

resolutionGroup?.addEventListener('click', async (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  setResolutionUI(btn.dataset.res);

  if (envelopeToggle?.classList.contains('checked')) {
    // resample with new resolution
    cachedSurfacePointCloud = null;
    clearPointCloud(viewer);
    envelopeToggle.classList.remove('checked');
    envelopeToggle.dispatchEvent(new Event('click'));
  }
});


if (innerShellToggle) {
  innerShellToggle.addEventListener('click', () => {
    innerShellToggle.classList.toggle('checked');
  });
}


// Clear cached surface cloud when URDF changes (select or drag/drop)
viewer?.addEventListener('urdf-processed', () => {
  resetSurfacePointCloud(viewer);
});
viewer?.addEventListener('urdf-change', () => {
  resetSurfacePointCloud(viewer);
});

autocenterToggle?.addEventListener('click', () => {
  autocenterToggle.classList.toggle('checked');
  viewer.noAutoRecenter = !autocenterToggle.classList.contains('checked');
});

hideFixedToggle?.addEventListener('click', () => {
  hideFixedToggle.classList.toggle('checked');
  const hideFixed = hideFixedToggle.classList.contains('checked');
  if (hideFixed) controlsel.classList.add('hide-fixed');
  else controlsel.classList.remove('hide-fixed');
});

upSelect?.addEventListener('change', () => viewer.up = upSelect.value);
controlsToggle?.addEventListener('click', () => controlsel.classList.toggle('hidden'));

viewer.addEventListener('urdf-change', () => {
  cachedSurfacePointCloud = null;
  clearPointCloud(viewer);

  envelopeToggle?.classList.remove('checked');
  if (innerShellToggle) innerShellToggle.style.display = 'none';
  if (exportToggle) exportToggle.style.display = 'none';

  Object.values(sliders).forEach(sl => sl.remove());
  sliders = {};
});

viewer.addEventListener('ignore-limits-change', () => {
  Object.values(sliders).forEach(sl => sl.update());
});

viewer.addEventListener('angle-change', e => {
  if (e && e.detail && sliders[e.detail]) sliders[e.detail].update();
  else Object.values(sliders).forEach(sl => sl.update());
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

viewer.addEventListener('manipulate-end', () => {
  viewer.noAutoRecenter = originalNoAutoRecenter;
});

// ============================================================
// Slider UI (existing joint sliders - unchanged)
// ============================================================
viewer.addEventListener('urdf-processed', () => {
  const r = viewer.robot;
  Object
    .keys(r.joints)
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
    .map(key => r.joints[key])
    .forEach(joint => {
      if (joint.jointType === 'prismatic' && Array.isArray(joint.mimicJoints) && joint.mimicJoints.length == 0) {
        console.log(`Skip slider for mimic prismatic joint: ${joint.name}`);
        return;
      }

      const li = document.createElement('li');
      li.innerHTML = `
        <span title="${joint.name}">${joint.name}</span>
        <input type="range" value="0" step="0.0001"/>
        <input type="number" step="0.0001" />
      `;
      li.setAttribute('joint-type', joint.jointType);
      li.setAttribute('joint-name', joint.name);

      sliderList.appendChild(li);

      const slider = li.querySelector('input[type="range"]');
      const input = li.querySelector('input[type="number"]');

      li.update = () => {
        const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : RAD2DEG;
        let angle = joint.angle;

        if (joint.jointType === 'revolute' || joint.jointType === 'continuous') angle *= degMultiplier;

        if (Math.abs(angle) > 1) angle = angle.toFixed(1);
        else angle = angle.toPrecision(2);

        input.value = parseFloat(angle);
        slider.value = joint.angle;

        if (viewer.ignoreLimits || joint.jointType === 'continuous') {
          slider.min = -6.28;
          slider.max = 6.28;
          input.min = -6.28 * degMultiplier;
          input.max = 6.28 * degMultiplier;
        } else {
          slider.min = joint.limit.lower;
          slider.max = joint.limit.upper;
          input.min = joint.limit.lower * degMultiplier;
          input.max = joint.limit.upper * degMultiplier;
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
        viewer.setJointValue(joint.name, slider.value);
        li.update();
      });

      input.addEventListener('change', () => {
        const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : DEG2RAD;
        viewer.setJointValue(joint.name, input.value * degMultiplier);
        li.update();
      });

      li.update();
      sliders[joint.name] = li;
    });
});

// ============================================================
// Loader + Drag&Drop (unchanged)
// ============================================================
document.addEventListener('WebComponentsReady', () => {
  viewer.loadMeshFunc = (path, manager, done) => {
    const ext = path.split(/\./g).pop().toLowerCase();
    switch (ext) {
      case 'gltf':
      case 'glb':
        new GLTFLoader(manager).load(path, result => done(result.scene), null, err => done(null, err));
        break;
      case 'obj':
        new OBJLoader(manager).load(path, result => done(result), null, err => done(null, err));
        break;
      case 'dae':
        new ColladaLoader(manager).load(path, result => done(result.scene), null, err => done(null, err));
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

  document.querySelector('li[urdf]')?.dispatchEvent(new Event('click'));

  if (/javascript\/example\/bundle/i.test(window.location)) {
    viewer.package = '../../../urdf';
  }

  registerDragEvents(viewer, () => {
    setColor('#263238');
    animToggle.classList.remove('checked');
    updateList();
  }, () => {
    cachedSurfacePointCloud = null;
    clearPointCloud(viewer);

    if (innerShellToggle) innerShellToggle.style.display = 'none';
    if (exportToggle) exportToggle.style.display = 'none';
    envelopeToggle.classList.remove('checked');
  });
});

// ============================================================
// Animation (unchanged)
// ============================================================
const updateAngles = () => {
  if (!viewer.setJointValue || !viewer.robot || !viewer.robot.joints) return;

  const time = Date.now() / 3e2;
  for (let i = 1; i <= 6; i++) {
    const offset = i * Math.PI / 3;
    const ratio = Math.max(0, Math.sin(time + offset));
    viewer.setJointValue(`HP${i}`, THREE.MathUtils.lerp(30, 0, ratio) * DEG2RAD);
    viewer.setJointValue(`KP${i}`, THREE.MathUtils.lerp(90, 150, ratio) * DEG2RAD);
    viewer.setJointValue(`AP${i}`, THREE.MathUtils.lerp(-30, -60, ratio) * DEG2RAD);
    viewer.setJointValue(`TC${i}A`, THREE.MathUtils.lerp(0, 0.065, ratio));
    viewer.setJointValue(`TC${i}B`, THREE.MathUtils.lerp(0, 0.065, ratio));
    viewer.setJointValue(`W${i}`, window.performance.now() * 0.001);
  }
};

const updateLoop = () => {
  if (animToggle.classList.contains('checked')) updateAngles();
  requestAnimationFrame(updateLoop);
};

const updateList = () => {
  document.querySelectorAll('#urdf-options li[urdf]').forEach(el => {
    el.addEventListener('click', e => {
      const urdf = e.target.getAttribute('urdf');
      const color = e.target.getAttribute('color');

      cachedSurfacePointCloud = null;
      clearPointCloud(viewer);

      if (innerShellToggle) innerShellToggle.style.display = 'none';
      if (exportToggle) exportToggle.style.display = 'none';
      envelopeToggle.classList.remove('checked');

      viewer.up = '+Z';
      document.getElementById('up-select').value = viewer.up;

      viewer.urdf = urdf;
      animToggle.classList.add('checked');
      setColor(color);
    });
  });
};

updateList();

document.addEventListener('WebComponentsReady', () => {
  animToggle.addEventListener('click', () => animToggle.classList.toggle('checked'));
  viewer.addEventListener('manipulate-start', () => animToggle.classList.remove('checked'));
  viewer.addEventListener('urdf-processed', () => updateAngles());
  updateLoop();

  viewer.camera.position.set(-5.5, 3.5, 5.5);
  autocenterToggle.classList.remove('checked');
  viewer.noAutoRecenter = true;
});
