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

const viewer = document.querySelector('urdf-viewer');
setupMiniStats(viewer);

const limitsToggle = document.getElementById('ignore-joint-limits');
const collisionToggle = document.getElementById('collision-toggle');
const envelopeToggle = document.getElementById('show-work-envelope');
const radiansToggle = document.getElementById('radians-toggle');
const autocenterToggle = document.getElementById('autocenter-toggle');
const upSelect = document.getElementById('up-select');
const sliderList = document.querySelector('#controls ul');
const controlsel = document.getElementById('controls');
const controlsToggle = document.getElementById('toggle-controls');
const animToggle = document.getElementById('do-animate');
const hideFixedToggle = document.getElementById('hide-fixed');
const ikMove = document.getElementById('ik-move');

// Toggle-Element für innere Punkte (HTML: <div id="show-inner-shell" class="toggle">Inner</div>)
const innerShellToggle = document.getElementById('show-inner-shell');

// NEW: Fortschrittsbalken Container (HTML: <div id="workspace-progress"></div>)
const progressHost = document.getElementById('workspace-progress');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 1 / DEG2RAD;

let sliders = {};

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
  ui.wrap.style.display = 'block';
  setProgress(0, 'Initialisiere…');
  return ui;
}

function hideProgress() {
  const ui = ensureProgressUI();
  if (!ui) return;
  ui.wrap.style.display = 'none';
}

function setProgress(pct, text) {
  const ui = ensureProgressUI();
  if (!ui) return;

  const clamped = Math.max(0, Math.min(100, pct));
  ui.bar.style.width = `${clamped}%`;
  ui.label.textContent = text ? `${text} (${clamped.toFixed(0)}%)` : `${clamped.toFixed(0)}%`;
}

// yield to browser to update UI
function nextFrame() {
  return new Promise(res => requestAnimationFrame(() => res()));
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
// Revolute-Parallelismus-Check (optional)
// ============================================================
export function checkRevoluteParallelism(robot) {
  if (!robot) return;

  robot.updateMatrixWorld(true);

  const revoluteJoints = [];
  robot.traverse(child => {
    if (child.isURDFJoint && child.jointType === 'revolute') {
      const axisWorld = child.axis.clone().transformDirection(child.matrixWorld).normalize();
      revoluteJoints.push({
        name: child.name,
        axis: axisWorld
      });
    }
  });

  if (revoluteJoints.length < 2) {
    console.warn('Weniger als 2 Revolute-Joints gefunden.');
    return;
  }

  const ref = revoluteJoints[1];
  console.log(`%c Referenz (2. Revolute Joint): ${ref.name}`, 'font-weight:bold; color:#00ffff;');

  const results = [];
  const epsilon = 0.005;

  for (let i = 2; i < revoluteJoints.length; i++) {
    const target = revoluteJoints[i];
    const dot = Math.abs(ref.axis.dot(target.axis));
    const isParallel = dot > (1.0 - epsilon);

    results.push({
      'Joint Name': target.name,
      'Typ': 'Revolute',
      'Parallel zu Ref?': isParallel ? ' JA' : ' NEIN',
      'Info': isParallel ? 'Gleiche Bewegungsebene' : 'Anderer Winkel'
    });
  }

  if (results.length > 0) console.table(results);
  else console.log('Keine weiteren Revolute-Joints nach der Referenz gefunden.');
}

// ============================================================
// Workspace: Punkte + Outer/Inner Shell (togglebar)
// ============================================================
let hullGroup = null;
let cachedHullGroup = null;

let outerShellObject = null;
let innerShellObject = null;
let innerNormalsObject = null;

function disposeGroup(g) {
  if (!g) return;
  g.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
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
        initial: c.angle
      });
    }
  });
  return movable;
}

function getFirstJointWorldOrigin(robot) {
  let first = null;

  robot.traverse(c => {
    if (!c.isURDFJoint) return;
    const parent = c.parent;
    if (parent && parent.isURDFLink && parent.name === 'base_link') first = c;
  });

  if (!first) {
    robot.traverse(c => {
      if (!first && c.isURDFJoint && c.jointType !== 'fixed') first = c;
    });
  }

  const o = new THREE.Vector3();
  if (first) first.getWorldPosition(o);
  else robot.getWorldPosition(o);
  return o;
}

function dirBinIndex(n, thetaBins, phiBins) {
  const theta = Math.atan2(n.z, n.x);
  const phi = Math.acos(THREE.MathUtils.clamp(n.y, -1, 1));

  let ti = Math.floor((theta + Math.PI) / (2 * Math.PI) * thetaBins);
  let pi = Math.floor(phi / Math.PI * phiBins);

  if (ti < 0) ti = 0;
  if (ti >= thetaBins) ti = thetaBins - 1;
  if (pi < 0) pi = 0;
  if (pi >= phiBins) pi = phiBins - 1;

  return ti + thetaBins * pi;
}

function extractOuterInnerShell(pts, origin, options = {}) {
  const cfg = {
    thetaBins: 180,
    phiBins: 90,
    innerMinRadius: 0.08,
    ...options
  };

  const binCount = cfg.thetaBins * cfg.phiBins;

  const outerR = new Float32Array(binCount);
  const innerR = new Float32Array(binCount);
  const outerIdx = new Int32Array(binCount);
  const innerIdx = new Int32Array(binCount);

  for (let i = 0; i < binCount; i++) {
    outerR[i] = -Infinity;
    innerR[i] = +Infinity;
    outerIdx[i] = -1;
    innerIdx[i] = -1;
  }

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < pts.length; i++) {
    v.subVectors(pts[i], origin);
    const r = v.length();
    if (r < 1e-9) continue;

    n.copy(v).multiplyScalar(1 / r);
    const b = dirBinIndex(n, cfg.thetaBins, cfg.phiBins);

    if (r > outerR[b]) {
      outerR[b] = r;
      outerIdx[b] = i;
    }

    if (r > cfg.innerMinRadius && r < innerR[b]) {
      innerR[b] = r;
      innerIdx[b] = i;
    }
  }

  const outer = [];
  const inner = [];

  for (let b = 0; b < binCount; b++) {
    const oi = outerIdx[b];
    if (oi >= 0) {
      const p = pts[oi];
      const nn = new THREE.Vector3().subVectors(p, origin).normalize();
      outer.push({ p, n: nn });
    }

    const ii = innerIdx[b];
    if (ii >= 0 && innerR[b] < +Infinity) {
      const p = pts[ii];
      const nn = new THREE.Vector3().subVectors(p, origin).normalize().multiplyScalar(-1);
      inner.push({ p, n: nn });
    }
  }

  return { outer, inner, cfg };
}

function voxelDownsample(points, voxelSize = 0.01) {
  const inv = 1 / voxelSize;
  const map = new Map();
  for (const p of points) {
    const kx = Math.round(p.x * inv);
    const ky = Math.round(p.y * inv);
    const kz = Math.round(p.z * inv);
    const key = `${kx},${ky},${kz}`;
    if (!map.has(key)) map.set(key, p);
  }
  return Array.from(map.values());
}

function buildPointCloud(points, { color = 0xffff00, size = 0.01, opacity = 0.9 } = {}) {
  const positions = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    positions[i * 3 + 0] = points[i].x;
    positions[i * 3 + 1] = points[i].y;
    positions[i * 3 + 2] = points[i].z;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity
  });

  return new THREE.Points(geo, mat);
}

function buildNormalLines(shell, length = 0.06, color = 0x00ff00) {
  const positions = new Float32Array(shell.length * 2 * 3);
  for (let i = 0; i < shell.length; i++) {
    const p = shell[i].p;
    const n = shell[i].n;

    positions[i * 6 + 0] = p.x;
    positions[i * 6 + 1] = p.y;
    positions[i * 6 + 2] = p.z;

    positions[i * 6 + 3] = p.x + n.x * length;
    positions[i * 6 + 4] = p.y + n.y * length;
    positions[i * 6 + 5] = p.z + n.z * length;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  return new THREE.LineSegments(geo, mat);
}

function setInnerVisibility(visible) {
  if (innerShellObject) innerShellObject.visible = visible;
  if (innerNormalsObject) innerNormalsObject.visible = visible;
  viewer.redraw();
}

// ============================================================
// Hauptfunktion (ASYNC): Sampling + Shell-Extract mit Progress
// ============================================================
export async function visualizeWorkspaceOuterInner(viewerEl, options = {}) {
  if (!viewerEl.robot) return;

  const config = {
    samples: 140000,
    sampleChunk: 2000, // UI-Update-Chunk

    // Punktwolke (optional)
    showRawPointCloud: false,
    rawPointColor: 0xaaaaaa,
    rawPointSize: 0.008,
    rawPointOpacity: 0.15,
    rawVoxelDownsample: true,
    rawVoxelSize: 0.015,

    // Shell-Bins
    thetaBins: 200,
    phiBins: 100,
    innerMinRadius: 0.08,

    // Shell-Punkte
    shellPointSize: 0.012,
    outerPointColor: 0x00ff00,
    innerPointColor: 0xff8800,
    shellPointOpacity: 0.95,

    // Normalen
    showNormals: true,
    normalLength: 0.06,
    outerNormalColor: 0x00ff00,
    innerNormalColor: 0xff8800,

    // UI default
    innerVisible: true,

    ...options
  };

  // progress ui
  showProgress();
  await nextFrame();

  // clear previous
  if (hullGroup) {
    viewerEl.scene.remove(hullGroup);
    disposeGroup(hullGroup);
    hullGroup = null;
  }
  outerShellObject = null;
  innerShellObject = null;
  innerNormalsObject = null;

  const robot = viewerEl.robot;
  robot.updateMatrixWorld(true);

  const toolPoint = findToolPoint(robot);
  if (!toolPoint) {
    console.warn('Kein tool_point / Endeffektor-Link gefunden.');
    hideProgress();
    return;
  }

  const movableJoints = collectMovableJoints(robot);
  if (!movableJoints.length) {
    console.warn('Keine beweglichen Joints gefunden.');
    hideProgress();
    return;
  }

  // -------------------------
  // 1) Sampling
  // -------------------------
  console.time('Workspace: Sampling');
  setProgress(0, 'Sampling');

  const pts = [];
  const pos = new THREE.Vector3();

  const total = config.samples;
  const chunk = Math.max(200, config.sampleChunk | 0);

  for (let i = 0; i < total; i++) {
    for (let j = 0; j < movableJoints.length; j++) {
      const mj = movableJoints[j];
      mj.obj.setJointValue(mj.min + Math.random() * (mj.range || 1));
    }
    robot.updateMatrixWorld(true);
    toolPoint.getWorldPosition(pos);
    pts.push(pos.clone());

    if ((i + 1) % chunk === 0) {
      const pct = (i + 1) / total * 75; // Sampling bis 75%
      setProgress(pct, 'Sampling');
      await nextFrame();
    }
  }

  // restore joints
  movableJoints.forEach(j => j.obj.setJointValue(j.initial));
  robot.updateMatrixWorld(true);

  console.timeEnd('Workspace: Sampling');

  // -------------------------
  // 2) Shell Extract
  // -------------------------
  setProgress(78, 'Shell-Extraktion');
  await nextFrame();

  const origin = getFirstJointWorldOrigin(robot);

  console.time('Workspace: Shell Extract');
  const { outer, inner } = extractOuterInnerShell(pts, origin, {
    thetaBins: config.thetaBins,
    phiBins: config.phiBins,
    innerMinRadius: config.innerMinRadius
  });
  console.timeEnd('Workspace: Shell Extract');

  setProgress(90, 'Rendering');
  await nextFrame();

  // -------------------------
  // 3) Render
  // -------------------------
  hullGroup = new THREE.Group();

  // optional raw cloud
  if (config.showRawPointCloud) {
    let rawPts = pts;
    if (config.rawVoxelDownsample) rawPts = voxelDownsample(pts, config.rawVoxelSize);

    const rawCloud = buildPointCloud(rawPts, {
      color: config.rawPointColor,
      size: config.rawPointSize,
      opacity: config.rawPointOpacity
    });
    hullGroup.add(rawCloud);
  }

  // outer points
  const outerPoints = outer.map(o => o.p);
  outerShellObject = buildPointCloud(outerPoints, {
    color: config.outerPointColor,
    size: config.shellPointSize,
    opacity: config.shellPointOpacity
  });
//   hullGroup.add(outerShellObject);

  // inner points (togglebar)
  const innerPoints = inner.map(o => o.p);
  innerShellObject = buildPointCloud(innerPoints, {
    color: config.innerPointColor,
    size: config.shellPointSize,
    opacity: config.shellPointOpacity
  });
  innerShellObject.visible = !!config.innerVisible;
//   hullGroup.add(innerShellObject);

  // normals
  if (config.showNormals) {
    const outerNormals = buildNormalLines(outer, config.normalLength, config.outerNormalColor);
    hullGroup.add(outerNormals);

    innerNormalsObject = buildNormalLines(inner, config.normalLength, config.innerNormalColor);
    innerNormalsObject.visible = !!config.innerVisible;
    hullGroup.add(innerNormalsObject);
  }

  viewerEl.scene.add(hullGroup);
  viewerEl.redraw();

  // sync UI toggle state if exists
  if (innerShellToggle) {
    if (config.innerVisible) innerShellToggle.classList.add('checked');
    else innerShellToggle.classList.remove('checked');
  }

  console.log('Shell points:', { outer: outer.length, inner: inner.length });

  setProgress(100, 'Fertig');
  await nextFrame();
  // optional: hide after short delay
  setTimeout(() => hideProgress(), 300);
}

// ============================================================
// UI wiring
// ============================================================
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
  Object.values(sliders).forEach(sl => sl.update());
});

collisionToggle.addEventListener('click', () => {
  collisionToggle.classList.toggle('checked');
  viewer.showCollision = collisionToggle.classList.contains('checked');
  viewer.redraw();
});

// Envelope: erzeugt outer+inner (mit Progress)
envelopeToggle.addEventListener('click', async () => {
  envelopeToggle.classList.toggle('checked');

  checkRevoluteParallelism(viewer.robot);

  if (envelopeToggle.classList.contains('checked')) {
    if (cachedHullGroup) {
      console.log('Lade gespeicherte Work Envelope (Outer/Inner)...');
      hullGroup = cachedHullGroup;
      viewer.scene.add(hullGroup);
      viewer.redraw();
      if (innerShellToggle) {
        const visible = innerShellToggle.classList.contains('checked');
        setInnerVisibility(visible);
      }
    } else {
      console.log('Generiere neue Work Envelope (Outer/Inner)...');

      const innerVisibleDefault = innerShellToggle ? innerShellToggle.classList.contains('checked') : true;

      await visualizeWorkspaceOuterInner(viewer, {
        samples: 2000000,
        sampleChunk: 2000,
        thetaBins: 200,
        phiBins: 100,
        innerMinRadius: 0.08,
        showRawPointCloud: false,
        showNormals: true,
        normalLength: 0.003,
        innerVisible: innerVisibleDefault
      });

      cachedHullGroup = hullGroup;
    }
  } else {
    if (hullGroup) {
      viewer.scene.remove(hullGroup);
      viewer.redraw();
    }
  }
});

// inner points on/off
if (innerShellToggle) {
  innerShellToggle.addEventListener('click', () => {
    innerShellToggle.classList.toggle('checked');
    const visible = innerShellToggle.classList.contains('checked');
    setInnerVisibility(visible);
  });
}

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
  if (hullGroup) {
    viewer.scene.remove(hullGroup);
    disposeGroup(hullGroup);
  }

  cachedHullGroup = null;
  hullGroup = null;
  outerShellObject = null;
  innerShellObject = null;
  innerNormalsObject = null;

  envelopeToggle.classList.remove('checked');
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
// Slider UI (unverändert)
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
          li.update = () => {};
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
// Loader + Drag&Drop (unverändert)
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
  });
});

// ============================================================
// Animation (unverändert)
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
