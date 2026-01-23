/* globals */
import * as THREE from 'three';
import { registerDragEvents } from './dragAndDrop.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import URDFManipulator from 'urdf-loader/src/urdf-manipulator-element.js'
import URDFIKManipulator from './URDFIKManipulator.js'
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
// Wir brauchen die Mathe-Klasse für die Berechnung der Zwischenschritte
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';


customElements.define('urdf-viewer', URDFIKManipulator);

// declare these globally for the sake of the example.
// Hack to make the build work with webpack for now.
// TODO: Remove this once modules or parcel is being used
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
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 1 / DEG2RAD;
let sliders = {};

import Stats from 'three/examples/jsm/libs/stats.module.js';

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


export function checkRevoluteParallelism(robot) {
    if (!robot) return;

    // 1. Wichtig: Welt-Transformationen aktualisieren
    robot.updateMatrixWorld(true);

    const revoluteJoints = [];
    
    // 2. Nur REVOLUTE Joints sammeln
    robot.traverse(child => {
        if (child.isURDFJoint && child.jointType === 'revolute') {
            // Achse in Welt-Koordinaten umrechnen
            const axisWorld = child.axis.clone().transformDirection(child.matrixWorld).normalize();
            
            revoluteJoints.push({ 
                name: child.name, 
                axis: axisWorld 
            });
        }
    });

    // Wir brauchen mindestens 2 Revolute Joints (einen als Referenz, einen zum Vergleichen)
    // Da wir Index 1 (den zweiten) als Referenz nehmen, brauchen wir mind. 2 Einträge.
    if (revoluteJoints.length < 2) {
        console.warn("Weniger als 2 Revolute-Joints gefunden.");
        return;
    }

    // 3. REFERENZ: Das ZWEITE Revolute-Gelenk (Index 1)
    const ref = revoluteJoints[1];
    console.log(`%c 🎯 Referenz (2. Revolute Joint): ${ref.name}`, 'font-weight:bold; color:#00ffff;');

    const results = [];
    const epsilon = 0.005; // Toleranz

    // 4. Loop ab dem DRITTEN Revolute-Gelenk (Index 2)
    // Falls es nur 2 gibt, läuft der Loop gar nicht erst los (korrekt).
    for (let i = 2; i < revoluteJoints.length; i++) {
        const target = revoluteJoints[i];

        // Skalarprodukt: |1| = Parallel
        const dot = Math.abs(ref.axis.dot(target.axis));
        const isParallel = dot > (1.0 - epsilon);

        results.push({
            'Joint Name': target.name,
            'Typ': 'Revolute',
            'Parallel zu Ref?': isParallel ? '✅ JA' : '❌ NEIN',
            'Info': isParallel ? 'Gleiche Bewegungsebene' : 'Anderer Winkel'
        });
    }

    if (results.length > 0) {
        console.table(results);
    } else {
        console.log("Keine weiteren Revolute-Joints nach der Referenz gefunden.");
    }
}


// /////---------------------------------




import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js'; 

let hullGroup = null;
let cachedHullGroup = null;

export function visualizeRefinedConvexHull(viewer, options = {}) {
    if (!viewer.robot) return;

    const config = {
        initialSamples: 4000,
        iterations: 6,
        mutationCount: 8,
        mutationRange: 0.15,
        
        color: 0x00ff00,
        opacity: 0,
        wireframe: false,
        
        // NEU: Punktewolke anzeigen?
        showPointCloud: false, 
        pointSize: 0.02,
        pointColor: 0xffff00, // Gelbe Punkte standardmäßig
        
        ...options
    };

    // --- AUFRÄUMEN ---
    if (hullGroup) {
        viewer.scene.remove(hullGroup);
        hullGroup.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
        hullGroup = null;
    }

    const robot = viewer.robot;
    robot.updateMatrixWorld(true);

    // --- SETUP ---
    let toolPoint = null;
    robot.traverse(c => { if (c.name === 'tool_point') toolPoint = c; });
    if (!toolPoint) robot.traverse(c => { if (c.isURDFLink && c.children.length === 0) toolPoint = c; });
    if (!toolPoint) return;

    const movableJoints = [];
    robot.traverse(c => {
        if (c.isURDFJoint && c.jointType !== 'fixed') {
            movableJoints.push({
                obj: c,
                min: c.limit.lower,
                range: c.limit.upper - c.limit.lower,
                initial: c.angle
            });
        }
    });

    // --- ALGORITHMUS ---
    let population = []; 

    console.time("Hull Refinement");

    const addPose = (angles) => {
        movableJoints.forEach((j, idx) => j.obj.setJointValue(angles[idx]));
        robot.updateMatrixWorld(true);
        const pos = new THREE.Vector3();
        toolPoint.getWorldPosition(pos);
        pos.userData = { angles: [...angles] };
        population.push(pos);
    };

    // 1. Initialisierung (Random + Limit + Zero Bias)
    for (let i = 0; i < config.initialSamples; i++) {
        const angles = [];
        const strategy = Math.random();
        movableJoints.forEach(j => {
            let val;
            if (strategy < 0.6) { 
                val = j.min + Math.random() * j.range;
            } else if (strategy < 0.8) { 
                const r = Math.random();
                if (r < 0.4) val = j.min;
                else if (r < 0.8) val = j.min + j.range;
                else val = j.min + Math.random() * j.range;
            } else {
                if (j.min <= 0 && (j.min + j.range) >= 0) val = (Math.random() - 0.5) * 0.05; 
                else val = j.min + Math.random() * j.range;
            }
            angles.push(val);
        });
        addPose(angles);
    }

    // 2. Iterative Verfeinerung
    const hullMath = new ConvexHull();

    for (let iter = 0; iter < config.iterations; iter++) {
        hullMath.setFromPoints(population);

        const hullVertices = [];
        const faces = hullMath.faces;
        const uniqueVertexSet = new Set();
        
        for (const face of faces) {
            let edge = face.edge;
            do {
                const point = edge.head().point;
                if (!uniqueVertexSet.has(point)) {
                    uniqueVertexSet.add(point);
                    hullVertices.push(point);
                }
                edge = edge.next;
            } while (edge !== face.edge);
        }

        console.log(`Iteration ${iter+1}: Verfeinere ${hullVertices.length} Außenpunkte...`);

        const currentMutation = config.mutationRange * (1 - (iter / config.iterations) * 0.6);

        for (const parentPoint of hullVertices) {
            const parentAngles = parentPoint.userData.angles;
            if (!parentAngles) continue;

            for (let m = 0; m < config.mutationCount; m++) {
                const newAngles = [];
                movableJoints.forEach((j, jointIdx) => {
                    const baseAngle = parentAngles[jointIdx];
                    let newAngle = baseAngle + (Math.random() - 0.5) * 2 * currentMutation;
                    if (newAngle < j.min) newAngle = j.min;
                    if (newAngle > j.min + j.range) newAngle = j.min + j.range;
                    newAngles.push(newAngle);
                });
                addPose(newAngles);
            }
        }
    }
    console.timeEnd("Hull Refinement");

    // Reset Roboter
    movableJoints.forEach(j => j.obj.setJointValue(j.initial));
    robot.updateMatrixWorld(true);


    // --- VISUALISIERUNG ---
    hullGroup = new THREE.Group();

    // A) Punktewolke (Optional)
    if (config.showPointCloud) {
        // Wir nehmen alle Punkte der Population
        const positions = new Float32Array(population.length * 3);
        for(let i=0; i<population.length; i++) {
            positions[i*3] = population[i].x;
            positions[i*3+1] = population[i].y;
            positions[i*3+2] = population[i].z;
        }
        
        const ptGeo = new THREE.BufferGeometry();
        ptGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const ptMat = new THREE.PointsMaterial({
            color: config.pointColor,
            size: config.pointSize,
            sizeAttenuation: true,
            transparent: true, 
            opacity: 0.8
        });
        const cloud = new THREE.Points(ptGeo, ptMat);
        hullGroup.add(cloud);
    }

    // B) Hülle (Mesh)
    let renderPoints = population;
    if (population.length > 0) {
        // Filterung auf Hüll-Vertices für sauberes Mesh
        hullMath.setFromPoints(population);
        const finalVertices = [];
        const fFaces = hullMath.faces;
        const fSet = new Set();
        for (const face of fFaces) {
             let edge = face.edge;
             do {
                 const p = edge.head().point;
                 if(!fSet.has(p)) { fSet.add(p); finalVertices.push(p); }
                 edge = edge.next;
             } while (edge !== face.edge);
        }
        renderPoints = finalVertices;
    }

    const geometry = new ConvexGeometry(renderPoints);
    
    const material = new THREE.MeshStandardMaterial({
        color: config.color,
        transparent: true,
        opacity: config.opacity,
        roughness: 0,
        metalness: 0,
        side: THREE.DoubleSide,
        wireframe: config.wireframe,
        depthWrite: false // <--- WICHTIG: Verhindert, dass die Hülle den Tiefenpuffer blockiert
    });

    const mesh = new THREE.Mesh(geometry, material);
    
    // --- NEU: Raycast und Render-Order anpassen ---
    
    // 1. Raycast deaktivieren: Damit geht der Mauszeiger einfach durch die Hülle durch
    mesh.raycast = () => {}; 
    
    // 2. Visuell nach hinten schieben: Roboter wird über der Hülle gezeichnet (optional)
    mesh.renderOrder = -1; 
    
    // ----------------------------------------------

    hullGroup.add(mesh);

    if (!config.wireframe) {
        const wireGeo = new THREE.WireframeGeometry(geometry);
        const wireMat = new THREE.LineBasicMaterial({ color: 0xac2828, transparent: true, opacity: 0 }); // opacity 0 macht es unsichtbar, falls gewünscht
        const wires = new THREE.LineSegments(wireGeo, wireMat);
        
        // --- NEU: Auch für das Drahtgitter Raycast deaktivieren ---
        wires.raycast = () => {};
        // ----------------------------------------------------------
        
        hullGroup.add(wires);
    }

    viewer.scene.add(hullGroup);
    viewer.redraw();
}

// Hilfsvektoren, um GC zu schonen
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _pIntersect = new THREE.Vector3();

function visualizeCrossSection(viewer, hullGroup) {
    if (!viewer.robot || !hullGroup) return;

    // 1. Den passenden Joint finden (Logik analog zu checkRevoluteParallelism)
    const revoluteJoints = [];
    viewer.robot.traverse(child => {
        if (child.isURDFJoint && child.jointType === 'revolute') {
            const axisWorld = child.axis.clone().transformDirection(child.matrixWorld).normalize();
            revoluteJoints.push({ obj: child, axis: axisWorld });
        }
    });

    if (revoluteJoints.length < 3) return; // Brauchen Ref(1) und Target(2+)

    const ref = revoluteJoints[1]; // Referenz ist der 2. Joint
    let targetJoint = null;

    // Suche den ersten Joint, der parallel ist
    for (let i = 2; i < revoluteJoints.length; i++) {
        const target = revoluteJoints[i];
        if (Math.abs(ref.axis.dot(target.axis)) > 0.99) {
            targetJoint = target.obj;
            break; 
        }
    }

    if (!targetJoint) {
        console.warn("Kein paralleler Joint für den Schnitt gefunden.");
        return;
    }

    console.log(`%c ✂️ Schneide Ebene an Joint: ${targetJoint.name}`, 'color: #ff0055; font-weight: bold;');

    // 2. Ebene Definieren
    // Normale = Rotationsachse (denn der Arm bewegt sich senkrecht dazu, 
    // wir wollen aber die Bewegungsebene sehen, also ist die Normale die Achse selbst)
    const planeNormal = targetJoint.axis.clone().transformDirection(targetJoint.matrixWorld).normalize();
    const planePoint = new THREE.Vector3();
    targetJoint.getWorldPosition(planePoint);

    const plane = new THREE.Plane();
    plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);

    // Visualisiere die Ebene (Optional, halbtransparent)
    const planeHelper = new THREE.PlaneHelper(plane, 1.5, 0xff0055);
    planeHelper.material.opacity = 0.1;
    planeHelper.material.transparent = true;
    // hullGroup.add(planeHelper);

    // 3. Schnittberechnung mit der Hülle
    const mesh = hullGroup.children.find(c => c.isMesh);
    if (!mesh) return;

    const geometry = mesh.geometry;
    const posAttr = geometry.attributes.position;
    const lines = [];

    // Iteriere über alle Dreiecke der Hülle
    // Wir nehmen an, es ist eine ConvexGeometry (Non-Indexed oder Indexed)
    // Zur Sicherheit wandeln wir Indizes manuell um, falls vorhanden.
    
    const getPoint = (idx, target) => {
        target.fromBufferAttribute(posAttr, idx);
        // Da die Hülle im Local Space der Group sein könnte, aber World Positionen nutzt:
        // Bei ConvexHull aus WorldPoints sind die Vertices meist schon World. 
        // Falls hullGroup transformiert wurde, müssten wir hier aufpassen.
        // Im Standard ConvexHull Code sind Punkte WorldSpace.
    };

    let indexCount = geometry.index ? geometry.index.count : posAttr.count;

    for (let i = 0; i < indexCount; i += 3) {
        let a, b, c;
        if (geometry.index) {
            a = geometry.index.getX(i);
            b = geometry.index.getX(i+1);
            c = geometry.index.getX(i+2);
        } else {
            a = i; b = i+1; c = i+2;
        }

        getPoint(a, _v1);
        getPoint(b, _v2);
        getPoint(c, _v3);

        // Distanzen zur Ebene
        const d1 = plane.distanceToPoint(_v1);
        const d2 = plane.distanceToPoint(_v2);
        const d3 = plane.distanceToPoint(_v3);

        // Prüfen, ob das Dreieck die Ebene schneidet (Vorzeichenwechsel)
        // Einfacher Test: Wenn alle d > 0 oder alle d < 0, kein Schnitt.
        if ((d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0)) {
            continue;
        }

        // Schnittpunkte finden
        const intersections = [];
        
        // Helfer für Kanten-Schnitt
        const intersectEdge = (pA, pB, dA, dB) => {
            // Wenn Vorzeichen unterschiedlich
            if ((dA > 0 && dB < 0) || (dA < 0 && dB > 0)) {
                const t = dA / (dA - dB); // Interpolationsfaktor
                const p = new THREE.Vector3().copy(pA).lerp(pB, t);
                intersections.push(p.x, p.y, p.z);
            } else if (dA === 0) {
                 intersections.push(pA.x, pA.y, pA.z); // Punkt liegt exakt drauf
            }
        };

        intersectEdge(_v1, _v2, d1, d2);
        intersectEdge(_v2, _v3, d2, d3);
        intersectEdge(_v3, _v1, d3, d1);

        // Wir erwarten in der Regel 2 Schnittpunkte pro Dreieck für eine Linie
        if (intersections.length >= 6) {
            lines.push(intersections[0], intersections[1], intersections[2]);
            lines.push(intersections[3], intersections[4], intersections[5]);
        }
    }

    if (lines.length === 0) return;

    // 4. Linie Erzeugen
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    
    const lineMat = new THREE.LineBasicMaterial({ 
        color: 0xff0055, // Auffälliges Pink/Rot
        linewidth: 2,    // Funktioniert nur in manchen Browsern/WebGL Implementierungen
        depthTest: false // Damit man die Linie immer sieht (Optional)
    });

    const crossSection = new THREE.LineSegments(lineGeo, lineMat);
    crossSection.renderOrder = 999; // Ganz oben zeichnen
    hullGroup.add(crossSection);
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
        .values(sliders)
        .forEach(sl => sl.update());
});

collisionToggle.addEventListener('click', () => {
    collisionToggle.classList.toggle('checked');
    viewer.showCollision = collisionToggle.classList.contains('checked');
    viewer.redraw();
});


envelopeToggle.addEventListener('click', () => {
    envelopeToggle.classList.toggle('checked');
    
    // 1. Parallelismus checken (nur Log-Ausgabe)
    checkRevoluteParallelism(viewer.robot);

    if (envelopeToggle.classList.contains('checked')) {
        
        // --- NEU: Prüfen ob Cache vorhanden ist ---
        if (cachedHullGroup) {
            console.log("Lade gespeicherte Work Envelope...");
            hullGroup = cachedHullGroup;
            viewer.scene.add(hullGroup);
            viewer.redraw();
        } else {
            // Keine Cache vorhanden -> Neu berechnen
            console.log("Generiere neue Work Envelope...");
            visualizeRefinedConvexHull(viewer, {
                initialSamples: 100000, 
                iterations: 5,
                color: 0xffffff,
                opacity: 0.25,
                showPointCloud: false
            });

            // Speichern für das nächste Mal
            cachedHullGroup = hullGroup;
        }

    } else {
        // Aufräumen, wenn Toggle aus
        if (hullGroup) {
            viewer.scene.remove(hullGroup);
            
            // WICHTIG: Wir setzen hullGroup hier NICHT auf null und disposen nicht,
            // damit cachedHullGroup die Referenz behält.
            
            viewer.redraw();
        }
    }
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
    if (hullGroup) {
        viewer.scene.remove(hullGroup);
        // Optional: Geometrie und Material aufräumen, um Speicher freizugeben
        hullGroup.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
    }

    // 2. Cache und Referenzen leeren (damit beim neuen Roboter neu berechnet wird)
    cachedHullGroup = null;
    hullGroup = null;

    // 3. Den Button "Show Work Envelope" visuell ausschalten (Häkchen weg)
    envelopeToggle.classList.remove('checked');
    Object
        .values(sliders)
        .forEach(sl => sl.remove());
    sliders = {};

});

viewer.addEventListener('ignore-limits-change', () => {

    Object
        .values(sliders)
        .forEach(sl => sl.update());

});


viewer.addEventListener('angle-change', e => {
    if (e && e.detail && sliders[e.detail]) {
        sliders[e.detail].update();
    } else {
        Object.values(sliders).forEach(sl => sl.update());
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

// create the sliders
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

            // --- Skip-Condition für prismatic + mimic ---
            if (joint.jointType === 'prismatic' && Array.isArray(joint.mimicJoints) && joint.mimicJoints.length == 0) {
                console.log(`Skip slider for mimic prismatic joint: ${joint.name}`);
                return; // kein Slider erzeugen
            }

            const li = document.createElement('li');
            li.innerHTML =
                `
        <span title="${joint.name}">${joint.name}</span>
        <input type="range" value="0" step="0.0001"/>
        <input type="number" step="0.0001" />
        `;
            li.setAttribute('joint-type', joint.jointType);
            li.setAttribute('joint-name', joint.name);

            sliderList.appendChild(li);

            // update the joint display
            const slider = li.querySelector('input[type="range"]');
            const input = li.querySelector('input[type="number"]');
            li.update = () => {
                const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : RAD2DEG;
                let angle = joint.angle;

                if (joint.jointType === 'revolute' || joint.jointType === 'continuous') {
                    angle *= degMultiplier;
                }

                if (Math.abs(angle) > 1) {
                    angle = angle.toFixed(1);
                } else {
                    angle = angle.toPrecision(2);
                }

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

    document.querySelector('li[urdf]').dispatchEvent(new Event('click'));

    if (/javascript\/example\/bundle/i.test(window.location)) {
        viewer.package = '../../../urdf';
    }

    registerDragEvents(viewer, () => {
        setColor('#263238');
        animToggle.classList.remove('checked');
        updateList();
    });

});

// init 2D UI and animation
const updateAngles = () => {
    if (!viewer.setJointValue || !viewer.robot || !viewer.robot.joints) return;

    // reset everything to 0 first
    // const resetJointValues = viewer.angles;
    // for (const name in resetJointValues) resetJointValues[name] = 0;
    // viewer.setJointValues(resetJointValues);



    // animate the legs
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

    if (animToggle.classList.contains('checked')) {
        updateAngles();
    }

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

    // stop the animation if user tried to manipulate the model
    viewer.addEventListener('manipulate-start', e => animToggle.classList.remove('checked'));
    viewer.addEventListener('urdf-processed', e => updateAngles());
    updateLoop();
    viewer.camera.position.set(-5.5, 3.5, 5.5);
    autocenterToggle.classList.remove('checked');
    viewer.noAutoRecenter = true;

});