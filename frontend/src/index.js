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
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';


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
        console.warn("Weniger als 2 Revolute-Joints gefunden.");
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

    if (results.length > 0) {
        console.table(results);
    } else {
        console.log("Keine weiteren Revolute-Joints nach der Referenz gefunden.");
    }
}







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
        
        showPointCloud: false, 
        pointSize: 0.02,
        pointColor: 0xffff00, 
        
        ...options
    };

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

    movableJoints.forEach(j => j.obj.setJointValue(j.initial));
    robot.updateMatrixWorld(true);


    hullGroup = new THREE.Group();

    if (config.showPointCloud) {
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

    let renderPoints = population;
    if (population.length > 0) {
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
        depthWrite: false 
    });

    const mesh = new THREE.Mesh(geometry, material);
    
    
    mesh.raycast = () => {}; 
    
    mesh.renderOrder = -1; 
    

    hullGroup.add(mesh);

    viewer.scene.add(hullGroup);
    viewer.redraw();
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _pIntersect = new THREE.Vector3();



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
    
    checkRevoluteParallelism(viewer.robot);

    if (envelopeToggle.classList.contains('checked')) {
        
        if (cachedHullGroup) {
            console.log("Lade gespeicherte Work Envelope...");
            hullGroup = cachedHullGroup;
            viewer.scene.add(hullGroup);
            viewer.redraw();
        } else {
            console.log("Generiere neue Work Envelope...");
            visualizeRefinedConvexHull(viewer, {
                initialSamples: 100000, 
                iterations: 5,
                color: 0x123423,
                opacity: 0.15,
                showPointCloud: false
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
        hullGroup.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
    }

    cachedHullGroup = null;
    hullGroup = null;

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

    viewer.addEventListener('manipulate-start', e => animToggle.classList.remove('checked'));
    viewer.addEventListener('urdf-processed', e => updateAngles());
    updateLoop();
    viewer.camera.position.set(-5.5, 3.5, 5.5);
    autocenterToggle.classList.remove('checked');
    viewer.noAutoRecenter = true;

});