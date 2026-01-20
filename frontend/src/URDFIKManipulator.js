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

export default class URDFIKManipulator extends URDFManipulator {
    constructor(context = {}) {
        // context is optional; when provided, it lets us share an existing scene/camera/renderer
        super();
        this.robotId = null; // set by robotManager
        this.requestRender = context.requestRender || null;

        // Prefer injected context from caller (e.g., viewer) so TransformControls bind to the right DOM element
        this.scene = context.scene || this.scene;
        this.world = context.world || this.world;
        this.camera = context.camera || this.camera;
        this.renderer = context.renderer || this.renderer;
        this.controls = context.controls || this.controls;

        const controls = this.controls;

        // Transform controls
        const transformControls = new TransformControls(this.camera, this.renderer?.domElement);
        transformControls.setSpace('world');
        transformControls.addEventListener('change', () => this.redraw());
        transformControls.setSpace('local');
        this.scene.add(transformControls.getHelper());

        // Target marker object
        const targetObject = new Group();
        const geometry = new SphereGeometry(0.005, 32, 16);
        const material = new MeshBasicMaterial({ color: 0xffff00 });
        const sphere = new Mesh(geometry, material);
        targetObject.add(sphere);

        this.world.add(targetObject);
        transformControls.attach(targetObject);

        // Members
        this.transformControls = transformControls;
        this.targetObject = targetObject;
        this.ikRoot = null;
        this.goal = null;
        this.solver = null;

        //this.solveAvgMs = 0;
        //this.solveCount = 0;



        // TransformControls events

        transformControls.addEventListener('dragging-changed', e => controls.enabled = !e.value);
        transformControls.addEventListener('mouseDown', () => this.onDragStart());
        transformControls.addEventListener('change', () => {
            this.onDragChange();
            if (this.requestRender) this.requestRender();
        });
        transformControls.addEventListener('mouseUp', () => this.onDragEnd());

        // keyboard shortcuts
        window.addEventListener('keydown', e => this.onKeyDown(e));


        this.addEventListener('urdf-processed', () => this.init());

        this.addEventListener('reset-angles', () => {
            const robot = this.robot;
            if (!robot) return;

            applyDefaultPose(robot);

            // Apply pose and synchronize IK/Goal
            robot.updateMatrixWorld(true);
            this.dispatchEvent(new Event('angle-change')); // triggers setIKFromUrdf + resetGoal()
        });

        this.addEventListener('angle-change', () => {
            setIKFromUrdf(this.ikRoot, this.robot);
            this.resetGoal();
        });

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
        sprite.raycast = () => { };
        this.targetObject.add(sprite);

        this.labelSprite = sprite;
        this.labelCanvas = canvas;
        this.labelCtx = ctx;
        this.labelTexture = texture;
        this.startPos = new Vector3();
    }

    /**
     * Attach an externally provided URDF robot to this manipulator and re-init IK/gizmo state.
     */
    setRobot(robot, robotId = null) {
        if (!robot) return;
        this.robot = robot;
        this.robotId = robotId ?? this.robotId;

        
        // Preserve the robot's current world transform
        const prevPos = robot.position.clone();
        const prevQuat = robot.quaternion.clone();
        robot.updateMatrixWorld(true);
        
        this.dispatchEvent(new Event('urdf-processed')); // ->calls init()
        // Restore preserved transform
        robot.position.copy(prevPos);
        robot.quaternion.copy(prevQuat);
        robot.updateMatrixWorld(true);
        
        //TODO robot is now restored correctly, but ikRoot is not in the right place and the gizmo is at the tool point in 0,0,0
        this.resetGoal();
    }

    init() {
        //https://gkjohnson.github.io/closed-chain-ik-js/
        const robot = this.robot;
        robot.updateMatrixWorld(true);

        // Init IK root
        // Clear the degrees of freedom to lock the root of the model
        const ik = urdfRobotToIKRoot(robot);
        setUrdfFromIK(robot, ik);
        ik.clearDoF();
        this.ikRoot = ik;

        applyDefaultPose(robot);
        // Initialize IK with URDF pose
        setIKFromUrdf(ik, robot);

        // Init the goal
        const tool_point = ik.find(c => c.name === 'tool_point');
        const goal = new Goal();
        goal.makeClosure(tool_point);
        tool_point.getWorldPosition(goal.position);
        tool_point.getWorldQuaternion(goal.quaternion);
        goal.setMatrixNeedsUpdate();
        this.goal = goal;
        this.solver = new Solver(ik);
        this.resetGoal();
    }

    resetGoal() {
        // Reset the goal to the tool_point of the current robot
        const ik = this.ikRoot;
        const goal = this.goal;
        const tool_point = ik.find(c => c.name === 'tool_point');
        tool_point.getWorldPosition(goal.position);
        tool_point.getWorldQuaternion(goal.quaternion);
        goal.setMatrixNeedsUpdate();
        const targetObject = this.targetObject;
        targetObject.position.set(...goal.position);
        targetObject.quaternion.set(...goal.quaternion);
        this.redraw();
        if (this.requestRender) this.requestRender();
    }

    solve() {
        if (!this.robot || !this.ikRoot || !this.goal) return;
        const goal = this.goal;
        const ik = this.ikRoot;
        const robot = this.robot;

        goal.setPosition(...this.targetObject.position);
        goal.setQuaternion(...this.targetObject.quaternion);
        setIKFromUrdf(ik, robot);

        const t0 = performance.now();

        const statuses = this.solver.solve();

        const dt = performance.now() - t0;

        if (!statuses.includes(SOLVE_STATUS.DIVERGED)) {
            // Preserve world transform to avoid overwriting the robot base transform
            let prevPos = null;
            let prevQuat = null;
            if (robot.position && typeof robot.position.clone === 'function') prevPos = robot.position.clone();
            if (robot.quaternion && typeof robot.quaternion.clone === 'function') prevQuat = robot.quaternion.clone();

            setUrdfFromIK(robot, ik);
            this.dispatchEvent(new Event('angle-change'));

            if (prevPos && prevQuat) {
                robot.position.copy(prevPos);
                robot.quaternion.copy(prevQuat);
                robot.updateMatrixWorld(true);
            }
        }

        const el = document.getElementById('output');
        if (el) {
            if (Array.isArray(statuses) && typeof SOLVE_STATUS_NAMES !== 'undefined') {
                const names = statuses.map(s => SOLVE_STATUS_NAMES[s]).join('\n');
                el.innerText = `${names}\n`;
            }
        }

        this.redraw();
        if (this.requestRender) this.requestRender();
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
    remove() {
        // Detach transform controls
        if (this.transformControls) {
            this.transformControls.detach();

            const helper = this.transformControls.getHelper();
            if (helper && helper.parent) {
                helper.parent.remove(helper);
            }

            this.transformControls.dispose?.();
            this.transformControls = null;
        }

        // Remove gizmo target object
        if (this.targetObject && this.targetObject.parent) {
            this.targetObject.parent.remove(this.targetObject);
        }

        this.targetObject = null;
        this.goal = null;
        this.ikRoot = null;
        this.solver = null;
    }

}
