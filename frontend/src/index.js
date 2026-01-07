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

import URDFLoader from 'urdf-loader/src/URDFLoader.js';
import { addRobot as registerRobot, listRobots, setStatusListener } from './robotManager.js';


customElements.define('urdf-viewer', URDFIKManipulator);

// declare these globally for the sake of the example.
// Hack to make the build work with webpack for now.
// TODO: Remove this once modules or parcel is being used
const viewer = document.querySelector('urdf-viewer');
setupMiniStats(viewer);

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
let sliders = {};

// Multi-robot UI controls
const multiRobotSelect = document.getElementById('multi-robot-model');
const addRobotBtn = document.getElementById('add-robot-btn');
const robotCountValue = document.getElementById('robot-count-value');
let nextOffset = 1;
let initialRegistered = false;

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

// Global Functions
const setColor = color => {

    document.body.style.backgroundColor = color;
    viewer.highlightColor = '#' + (new THREE.Color(0xffffff)).lerp(new THREE.Color(color), 0.35).getHexString();

};

// Multi-robot helpers
const availableModels = [];

const updateRobotCount = () => {
    if (!robotCountValue) return;

    const count = listRobots().length;
    robotCountValue.textContent = count;
};

const initMultiRobotOptions = () => {
    if (!multiRobotSelect) return;

    availableModels.length = 0;

    const elements = document.querySelectorAll('#urdf-options li[urdf]');


    const options = Array.from(elements)
        .map(element => ({
            urdf: element.getAttribute('urdf'),
            label: element.textContent.trim(),
            color: element.getAttribute('color') || '#cccccc',
        }));
        
    availableModels.push(...options);
    multiRobotSelect.innerHTML = '';

    options.forEach(opt => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.urdf;
        optionEl.textContent = opt.label;
        multiRobotSelect.appendChild(optionEl);
    });
};

setStatusListener(() => updateRobotCount());

// Register the initially loaded robot so it counts as active.
viewer.addEventListener('urdf-processed', async () => {
    if (initialRegistered || !viewer.robot) return;
    try {
        await registerRobot({ model: viewer.urdf, urdfPath: viewer.urdf, sceneNode: viewer.robot });
        nextOffset = Math.max(nextOffset, 1);
        updateRobotCount();
        initialRegistered = true;
    } catch (err) {
        console.warn('Failed to register initial robot', err);
    }
});

const loadUrdfModel = (urdfPath) => new Promise((resolve, reject) => { // promise for URDFLoader -> async/await is simpler

    const loader = new URDFLoader();
    if (viewer.loadMeshFunc) loader.loadMeshCb = viewer.loadMeshFunc;
    if (viewer.fetchOptions) loader.fetchOptions = viewer.fetchOptions;

    loader.load(urdfPath, robot => resolve(robot), undefined, err => reject(err));
});

const renderForAFewFrames = (frames = 8) => new Promise(resolve => {
    let count = 0;
    const tick = () => {
        if (viewer.controls && typeof viewer.controls.update === 'function') {
            viewer.controls.update();
        }
        if (viewer.redraw) {
            viewer.redraw();
        } else if (viewer.renderer && viewer.scene && viewer.camera) {
            viewer.renderer.render(viewer.scene, viewer.camera);
        }
        if (++count >= frames) return resolve();
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
});

const spawnRobotInstance = async (urdfPath) => {
    if (!urdfPath || !viewer) return null;

    const offset = nextOffset++;
    const robot = await loadUrdfModel(urdfPath);

    robot.position.x = offset * 1.5;
    robot.name = robot.name || `robot_${offset}`;
    robot.traverse(node => {
        if (node && node.isObject3D) {
            node.frustumCulled = false; // avoid missing parts until camera moves
        }
    });
    robot.updateMatrixWorld(true);

    viewer.world.add(robot);
    viewer.world.updateMatrixWorld(true);

    await renderForAFewFrames();

    await registerRobot({ model: urdfPath, urdfPath, sceneNode: robot });
    updateRobotCount();

    return robot;
};

if (addRobotBtn && multiRobotSelect) {
    addRobotBtn.addEventListener('click', async () => {
        const urdfPath = multiRobotSelect.value;
        if (!urdfPath) return;
        try {
            await spawnRobotInstance(urdfPath);
        } catch (err) {
            console.warn('Failed to add robot', err);
        }
    });
}

initMultiRobotOptions();
updateRobotCount();


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