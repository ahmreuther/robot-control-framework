import URDFManipulator from 'urdf-loader/src/urdf-manipulator-element.js';
import {
    Goal,
    SOLVE_STATUS,
    DOF,
    setUrdfFromIK,
    setIKFromUrdf,
    urdfRobotToIKRoot,
    SOLVE_STATUS_NAMES,
    Solver
} from 'closed-chain-ik';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
    Group,
    SphereGeometry,
    MeshBasicMaterial,
    Mesh,
    Sprite,
    SpriteMaterial,
    CanvasTexture,
    Vector3,
    Quaternion
} from 'three';

// Shared helper to set a sensible starting pose per robot name
export const applyDefaultPose = (robot) => {
    if (!robot || !robot.joints) return;

    const degToRad = deg => deg * Math.PI / 180;
    const jointNames = Object.keys(robot.joints);
    if (jointNames.length === 0) return;

    const set = (idx, value) => {
        const name = jointNames[idx];
        if (name !== undefined) {
            robot.setJointValue(name, value);
        }
    };

    const urdfName = (robot.robotName || robot.name || '').toLowerCase();

    if (urdfName.includes('eva_description')) {
        set(1, 0);
        set(2, degToRad(-90));
        set(3, 0);
        set(4, degToRad(-90));
        set(5, 0);
    } else if (urdfName.includes('ur5')) {
        set(1, -1.57);
        set(2, 1.57);
        set(3, 0);
        set(4, 0);
        set(5, 0);
    } else if (urdfName.includes('fr3')) {
        set(0, 0);
        set(1, 0);
        set(2, 0);
        set(3, 0);
        set(4, degToRad(-90));
        set(5, 0);
        set(6, degToRad(90));
        set(7, degToRad(-45));
        set(8, 0);
    } else {
        for (let i = 1; i < jointNames.length; ++i) {
            robot.setJointValue(jointNames[i], 0.0);
        }
    }
};

export default
    class URDFIKManipulator extends URDFManipulator {
    constructor(...args) {
        super(...args);

        // IK members
        this.ikRoot = null;
        this.goal = null;
        this.solver = null;
        this.targetObject = null;
        this.transformControls = null;
        this.labelSprite = null;
        this.startPos = new Vector3();

        //events
        this.addEventListener('urdf-processed', () => this.init());

        this.addEventListener('reset-angles', () => {
            if (!this.robot) return;

            applyDefaultPose(this.robot);
            this.robot.updateMatrixWorld(true);
            this.dispatchEvent(new Event('angle-change')); // triggers setIKFromUrdf + resetGoal()
        });

        this.addEventListener('angle-change', () => {
            if (this.ikRoot && this.robot) setIKFromUrdf(this.ikRoot, this.robot);
            this.resetGoal();
        });
    }

    init() {
        if (!this.robot) return;
        this.robot.updateMatrixWorld(true);

        // Init IK root
        // Clear the degrees of freedom to lock the root of the model
        const ik = urdfRobotToIKRoot(this.robot);
        setUrdfFromIK(this.robot, ik);
        ik.clearDoF();
        this.ikRoot = ik;

        // Default pose
        applyDefaultPose(this.robot);

        // Initialize IK with URDF pose
        setIKFromUrdf(ik, this.robot);

        // Init the goal
        const tool_point = ik.find(c => c.name === 'tool_point');
        const goal = new Goal();
        goal.makeClosure(tool_point);
        tool_point.getWorldPosition(goal.position);
        tool_point.getWorldQuaternion(goal.quaternion);
        goal.setMatrixNeedsUpdate();
        this.goal = goal;
        // Init solver
        this.solver = new Solver(ik);

        // Create target gizmo
        this.createTargetGizmo(tool_point);

        // Reset goal
        this.resetGoal();

        // Catch debug output element
        this.debugOutputEl = document.getElementById('output');
    }
    createTargetGizmo(tool_point) {
        const targetObject = new Group();

        // Sphere marker
        const geometry = new SphereGeometry(0.005, 32, 16);
        const material = new MeshBasicMaterial({ color: 0xffff00 });
        const sphere = new Mesh(geometry, material);
        targetObject.add(sphere);

        // Label sprite
        const canvas = document.createElement('canvas');
        canvas.width = 356;
        canvas.height = 94;
        const ctx = canvas.getContext('2d');
        const texture = new CanvasTexture(canvas);
        const spriteMaterial = new SpriteMaterial({ map: texture, depthTest: false });
        const sprite = new Sprite(spriteMaterial);
        sprite.scale.set(0.12, 0.035, 1.0);
        sprite.position.set(0.1, -0.15, 0);
        sprite.visible = false;
        sprite.raycast = () => { }; // Prevent raycast from blocking transform controls
        this.targetObject.add(sprite);

        this.labelSprite = sprite;
        this.labelCanvas = canvas;
        this.labelCtx = ctx;
        this.labelTexture = texture;
        
        // Add gizmo to the scene
        this.scene.add(targetObject);
        this.targetObject = targetObject;
        
        // TransformControls setup
        const controls = this.controls;
        const transformControls = new TransformControls(this.camera, this.renderer.domElement);
        transformControls.setSpace('world');
        transformControls.attach(targetObject);
        this.scene.add(transformControls);
        this.scene.add(transformControls.getHelper());
        this.transformControls = transformControls;

        // TransformControls events
        
        transformControls.addEventListener('dragging-changed', e => controls.enabled = !e.value);
        transformControls.addEventListener('mouseDown', () => this.onDragStart());
        transformControls.addEventListener('change', () => this.onDragChange());
        transformControls.addEventListener('mouseUp', () => this.onDragEnd());

        // keyboard shortcuts
        window.addEventListener('keydown', e => this.onKeyDown(e));
    }

    resetGoal() {
        // Reset the goal
        //const ik = this.ikRoot;
        //const goal = this.goal;
        //const targetObject = this.targetObject;
        if (!this.ikRoot || !this.goal || !this.targetObject) return;


        const tool_point = this.ikRoot.find(c => c.name === 'tool_point');
        tool_point.getWorldPosition(this.goal.position);
        tool_point.getWorldQuaternion(this.goal.quaternion);
        this.goal.setMatrixNeedsUpdate();
        
        //this.targetObject.position.set(...this.goal.position);
        //this.targetObject.quaternion.set(...this.goal.quaternion);
        // Faster copy because we are reusing existing Vector3 and Quaternion objects instead of arrays
        this.targetObject.position.copy(this.goal.position);
        this.targetObject.quaternion.copy(this.goal.quaternion);

        this.redraw();
    }
    solve() {
        if(!this.goal || !this.ikRoot || !this.robot || !this.solver) return;

        this.goal.position.copy(this.targetObject.position);
        this.goal.quaternion.copy(this.targetObject.quaternion);        
        setIKFromUrdf(this.ikRoot, this.robot);

        const statuses = this.solver.solve();

        // Update if successful
        if (!statuses.includes(SOLVE_STATUS.DIVERGED)) {
            setUrdfFromIK(this.robot, this.ikRoot);
            this.dispatchEvent(new Event('angle-change'));
        }
        // Debug output with caching
        if (this.debugOutputEl && Array.isArray(statuses) && SOLVE_STATUS_NAMES) {
            const text = statuses.map(s => SOLVE_STATUS_NAMES[s]).join('\n');
            if (this.debugOutputEl.innerText !== text) {
                this.debugOutputEl.innerText = text;
            }
        }

        this.redraw();
    }

    
    onDragStart() {
        this.controls.enabled = false;

        this.targetObject.getWorldPosition(this.startPos);
        this.labelSprite.visible = true;
        this.drawLabelText(new Vector3());
        this.labelTexture.needsUpdate = true;

        this.dispatchEvent(new Event("manipulate-start"));
    }

    onDragChange() {
        this.solve();
        if (!this.labelSprite.visible) return;

        const delta = new Vector3();
        this.targetObject.getWorldPosition(delta).sub(this.startPos);

        this.drawLabelText(delta);
        this.labelTexture.needsUpdate = true;

        //this.redraw(); // Already called in solve()
    }

    onDragEnd() {
        this.resetGoal();

        this.controls.enabled = true;
        this.labelSprite.visible = false;
        this.dispatchEvent(new Event("manipulate-end"));

    }

    drawLabelText(delta) {
        const ctx = this.labelCtx;
        const canvas = this.labelCanvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const radius = 20;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(canvas.width - radius, 0);
        ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
        ctx.lineTo(canvas.width, canvas.height - radius);
        ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
        ctx.lineTo(radius, canvas.height);
        ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
        ctx.lineTo(0, radius);
        ctx.quadraticCurveTo(0, 0, radius, 0);
        ctx.closePath();
        ctx.fill();

        let labelText = 'Δ: 0.0 mm';
        if (delta && typeof delta.x === "number") {
            const dx = delta.x * 1000;
            const dy = delta.y * 1000;
            const dz = delta.z * 1000;

            const abs = { x: Math.abs(dx), y: Math.abs(dy), z: Math.abs(dz) };
            let axis = 'x', value = dx;
            if (abs.y > abs.x && abs.y >= abs.z) { axis = 'y'; value = dy; }
            if (abs.z > abs.x && abs.z > abs.y) { axis = 'z'; value = dz; }
            if (isNaN(value)) value = 0.0;

            labelText = `Δ${axis.toUpperCase()}: ${value.toFixed(1)} mm`;
        }

        ctx.fillStyle = 'white';
        ctx.font = 'bold 42px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 6;
        ctx.fillText(labelText, canvas.width / 2, canvas.height / 2);
    }

    onKeyDown(e) {
        if (!this.transformControls) return;
        switch (e.key) {
            case 'w':
                this.transformControls.setMode('translate');
                break;
            case 'e':
                this.transformControls.setMode('rotate');
                break;
            case 'q':
                this.transformControls.setSpace(this.transformControls.space === 'local' ? 'world' : 'local');
                break;
            case 't':
                if (this.transformControls.object) { //is null if not attached
                    this.transformControls.detach();
                    this.scene.remove(this.transformControls.getHelper());
                } else {
                    this.transformControls.attach(this.targetObject);
                    this.scene.add(this.transformControls.getHelper());
                }
                break;
        }
        
    }
}
