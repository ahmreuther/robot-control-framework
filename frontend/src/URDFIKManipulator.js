/*
Per-robot IK/FK wrapper. Reuses the viewer scene/camera/renderer, parks gizmos on each robot rig so slot offsets keep IK stable,
and rebuilds drag controls so hovering/picking stay on the active robot only.
*/
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
import { PointerURDFDragControls } from 'urdf-loader/src/URDFDragControls.js';

// Shared helper to set a sensible starting pose per robot name (avoids starting in singularities).
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

        /*
        Base manipulator assumed one robot with global drag controls.
        Keep its hover logic, drop global controls, and rebuild per-robot controls so highlighting stays local.
        */

        // Save the joint highlighting logic from the parent class
        this._parentHighlightingLogic = null;
        if (this.dragControls) {
            this._parentHighlightingLogic = {
                onHover: this.dragControls.onHover,
                onUnhover: this.dragControls.onUnhover,
            };
        }

        /* Drop the parent's global drag controls; we attach fresh controls to the current robot instead. */
        if (this.dragControls) {
            this.dragControls.dispose();
            this.dragControls = null;
        }

        this.robotId = null; // set by robotManager
        this.requestRender = context.requestRender || null;

        this.scene = context.scene || this.scene;
        this.world = context.world || this.world;
        this.camera = context.camera || this.camera;
        this.renderer = context.renderer || this.renderer;
        this.controls = context.controls || this.controls;


        // Transform controls drive the IK gizmo; FK dragging toggles with 't'.
        this.transformControls = new TransformControls(this.camera, this.renderer?.domElement);
        this.transformControls.setSpace('local');
        this.transformControls.addEventListener('change', () => this.redraw());

        const geometry = new SphereGeometry(0.005, 32, 16);
        const material = new MeshBasicMaterial({ color: 0xffff00 });
        const sphere = new Mesh(geometry, material);

        this.targetObject = new Group();
        this.targetObject.add(sphere);

        // Park the target/gizmo in the robot's rig so slot offsets do not break IK.

        this.ikRoot = null;
        this.goal = null;
        this.solver = null;

        // TransformControls events
        this.transformControls.addEventListener('dragging-changed', e => this.controls.enabled = !e.value);
        this.transformControls.addEventListener('mouseDown', () => this.onDragStart());
        this.transformControls.addEventListener('change', () => {
            this.onDragChange();
            if (this.requestRender) this.requestRender();
        });
        this.transformControls.addEventListener('mouseUp', () => this.onDragEnd());

        // Keep IK state aligned with URDF load/reset flows.
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

        // sprite label
        const canvas = document.createElement('canvas');
        canvas.width = 356;
        canvas.height = 94;
        this.labelCanvas = canvas;

        this.labelCtx = canvas.getContext('2d');
        this.labelTexture = new CanvasTexture(canvas);

        const spriteMaterial = new SpriteMaterial({ map: this.labelTexture, depthTest: false });
        this.labelSprite = new Sprite(spriteMaterial);
        this.labelSprite.scale.set(0.12, 0.035, 1.0);
        this.labelSprite.position.set(0.1, -0.15, 0);
        this.labelSprite.visible = false;
        this.labelSprite.raycast = () => { };

        this.targetObject.add(this.labelSprite);
        this.startPos = new Vector3();
    }

    /**
     * Attach an externally provided URDF robot to this manipulator and re-init IK/gizmo state.
     */
    setRobot(robot, robotId = null, baseGroup = null){
        if (!robot) return;

        // Rig becomes the manipulator base so the gizmo inherits the offset.
        // We keep IK math in robot-local space and let the rig carry any world/slot offset.
        this.setBaseGroup(baseGroup);

        this.robot = robot;
        this.robotId = robotId || this.robotId;

        // Default: drag controls disabled, gizmo enabled. Use 't' to toggle IK gizmo vs FK dragging.
        this._disableDragControls();

        if (this.targetObject && this.transformControls) {
            this.baseGroup.add(this.targetObject);
            this.transformControls.attach(this.targetObject);
            this.scene.add(this.transformControls.getHelper());
        }
        // Re-init IK/gizmo state (in robot-local space)
        this.dispatchEvent(new Event('urdf-processed'));
        this.resetGoal();
    }

    setBaseGroup(group) {
        const next = group || this.world;
        if (!next || !this.targetObject) return;

        if (this.targetObject.parent !== next) {
            if (this.targetObject.parent) this.targetObject.parent.remove(this.targetObject);
            next.add(this.targetObject);
        }

        this.baseGroup = next;
    }
    // New drag controls that keep the parent's hover visuals but are scoped to this robot only.
    _enableDragControls() {
        // Safe to call even if already enabled, will reset
        if (this.dragControls) this.dragControls.dispose();

        if (!this.renderer || !this.renderer.domElement) return;

        // Pass this.robot to restrict raycasting to this robot only; prevents cross-robot selections.
        this.dragControls = new PointerURDFDragControls(this.robot, this.camera, this.renderer.domElement);
         
        this.dragControls.onDragStart = j => {
            this.controls.enabled = false;
            this.dispatchEvent(new CustomEvent('manipulate-start', { detail: j.name, bubbles: true, cancelable: true }));
            this.redraw();
            this.requestRender?.();
        };

        this.dragControls.onDragEnd = j => {
            this.controls.enabled = true;
            this.dispatchEvent(new CustomEvent('manipulate-end', { detail: j.name, bubbles: true, cancelable: true }));
            this.redraw();
            this.requestRender?.();
        };

        this.dragControls.updateJoint = (j, angle) => this.setJointValue(j.name, angle);
        
        // Reuse saved highlighting so FK hover feedback matches the original while staying per robot.
        if (this._parentHighlightingLogic) {
            this.dragControls.onHover = j => {
                this._parentHighlightingLogic.onHover(j);
                this.requestRender?.(); 
            };
            this.dragControls.onUnhover = j => {
                this._parentHighlightingLogic.onUnhover(j);
                this.requestRender?.();
            };
        }
    }

    _disableDragControls() {
        if (this.dragControls) {
            // If something is currently highlighted, un-highlight it before destroying controls
            if (this.dragControls.hovered) {
                this.dragControls.onUnhover(this.dragControls.hovered);
            }
            this.dragControls.dispose();
            this.dragControls = null;
        }
    }

    init() {
        // IK init pipeline (closed-chain-ik): build IK tree, lock root (rig carries world transform), seed pose,
        // sync IK with URDF, create goal/solver, then reset goal.
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

    /**
     * Set a joint value on this manipulator's robot
     */
    setJointValue(jointName, value) {
        if (!this.robot || !this.robot.joints || !this.robot.joints[jointName]) {
            console.error(`Joint ${jointName} not found on robot: ${this.robot} id: ${this.robotId}`);
            return;
        }
        
        this.robot.setJointValue(jointName, value);
        
        // Update IK state
        if (this.ikRoot) {
            setIKFromUrdf(this.ikRoot, this.robot);
        }
        
        // Reset goal to new position
        this.resetGoal();
        
        // Trigger angle change event
        this.dispatchEvent(new CustomEvent('angle-change', { detail: jointName }));
        
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

        if (!statuses.includes(SOLVE_STATUS.DIVERGED)){
            setUrdfFromIK(robot, ik);
            this.dispatchEvent(new Event('angle-change'));

            // Keep robot at local origin; the rig holds world offset so IK math stays stable.
            robot.position.set(0, 0, 0);
            robot.quaternion.identity();
            robot.updateMatrixWorld(true);

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

    handleKey(key) {
        if (this.ignoreKeys) return;
        
        if (!this.transformControls) return;
        switch (key) {
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
                if (this.transformControls.object) { 
                    // Case 1: Gizmo is active. Switch to Joint Drag Mode (FK).
                    this.transformControls.detach();
                    this.scene.remove(this.transformControls.getHelper());

                    // Enable FK dragging
                    this._enableDragControls();
                } else {
                    // Case 2: FK is active. Switch to Gizmo Mode (IK).
                    this.transformControls.attach(this.targetObject);
                    this.scene.add(this.transformControls.getHelper());
                    
                    // Disable FK dragging
                    this._disableDragControls();
                }
                break;
        }

    }

    setActiveState(isActive) {
        if (!this.transformControls) return;

        if (this.controls) {
            this.controls.enabled = true;
        }

        if (isActive) {
            if (!this.transformControls.object && this.targetObject) {
                this.transformControls.attach(this.targetObject);
                this.scene.add(this.transformControls.getHelper());
            }
            this._disableDragControls();
        } else {
            if (this.transformControls.object) {
                this.transformControls.detach();
                this.scene.remove(this.transformControls.getHelper());
            }
            this._enableDragControls();
        }
    }
    remove() {
        // Dispose per-robot controls and gizmo so rigs can be removed without leaking DOM/Three objects.
        this._disableDragControls();

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
