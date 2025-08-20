import URDFManipulator from 'urdf-loader/src/urdf-manipulator-element.js';
import {
    Goal,
    SOLVE_STATUS,
    DOF,
    setUrdfFromIK,
    setIKFromUrdf,
    urdfRobotToIKRoot,
    Solver,
    SOLVE_STATUS
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

export default
    class URDFIKManipulator extends URDFManipulator {
    constructor(...args) {
        super(...args);

        const controls = this.controls;

        // Transform controls
        const transformControls = new TransformControls(this.camera, this.renderer.domElement);
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
        let transformControlsEnabled = true;
        transformControls.attach(targetObject);

        // Members
        this.transformControls = transformControls;
        this.targetObject = targetObject;
        this.ikRoot = null;
        this.goal = null;
        this.helper = null;
        this.solver = null;

        // Events
        transformControls.addEventListener('dragging-changed', function (event) {
            controls.enabled = !event.value;
        });

        transformControls.addEventListener('change', () => this.solve());
        transformControls.addEventListener('mouseUp', () => this.resetGoal());

        transformControls.addEventListener('mouseDown', () => {
            controls.enabled = false;
            this.dispatchEvent(new Event("manipulate-start"));
        });

        transformControls.addEventListener('mouseUp', () => {
            controls.enabled = true;
            this.dispatchEvent(new Event("manipulate-end"));
        });

        // Keyboard shortcuts for transform controls
        window.addEventListener('keydown', e => {
            switch (e.key) {
                case 'w':
                    transformControls.setMode('translate');
                    break;
                case 'e':
                    transformControls.setMode('rotate');
                    break;
                case 'q':
                    transformControls.setSpace(transformControls.space === 'local' ? 'world' : 'local');
                    break;
                case 't':
                    if (transformControlsEnabled) {
                        transformControls.detach();
                        transformControlsEnabled = false;
                        this.scene.remove(transformControls.getHelper());
                    } else {
                        transformControls.attach(this.targetObject);
                        transformControlsEnabled = true;
                        this.scene.add(transformControls.getHelper());
                    }
                    break;
            }
        });

        this.addEventListener('urdf-processed', () => this.init());

        this.addEventListener('reset-angles', () => {
            const robot = this.robot;
            if (!robot) return;

            const deg_to_rad = deg => deg * Math.PI / 180;
            const jointNames = Object.keys(robot.joints);
            const urdfName = (robot.robotName || robot.name || '').toLowerCase();

            if (urdfName.includes('eva_description')) {
                robot.setJointValue(jointNames[1], 0);
                robot.setJointValue(jointNames[2], deg_to_rad(-90));
                robot.setJointValue(jointNames[3], 0);
                robot.setJointValue(jointNames[4], deg_to_rad(-90));
                robot.setJointValue(jointNames[5], 0);
            } else if (urdfName.includes('ur5')) {
                robot.setJointValue(jointNames[1], -1.57);
                robot.setJointValue(jointNames[2], 1.57);
                robot.setJointValue(jointNames[3], 0);
                robot.setJointValue(jointNames[4], 0);
                robot.setJointValue(jointNames[5], 0);
            } else if (urdfName.includes('fr3')) {
                robot.setJointValue(jointNames[0], 0);
                robot.setJointValue(jointNames[1], 0);
                robot.setJointValue(jointNames[2], 0);
                robot.setJointValue(jointNames[3], 0);
                robot.setJointValue(jointNames[4], deg_to_rad(-90));
                robot.setJointValue(jointNames[5], 0);
                robot.setJointValue(jointNames[6], deg_to_rad(90));
                robot.setJointValue(jointNames[7], deg_to_rad(-45));
                robot.setJointValue(jointNames[8], 0);
            } else {
                // Default: all to 0
                for (let i = 1; i < jointNames.length; ++i) {
                    robot.setJointValue(jointNames[i], 0.0);
                }
            }

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

        this.drawLabelText = (delta) => {
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

            if (!delta || typeof delta.x !== "number") {
                ctx.fillStyle = 'white';
                ctx.font = 'bold 42px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`Δ: 0.0 mm`, canvas.width / 2, canvas.height / 2);
                return;
            }

            const dx = delta.x * 1000;
            const dy = delta.y * 1000;
            const dz = delta.z * 1000;

            const abs = { x: Math.abs(dx), y: Math.abs(dy), z: Math.abs(dz) };
            let axis = 'x', value = dx;
            if (abs.y > abs.x && abs.y >= abs.z) { axis = 'y'; value = dy; }
            if (abs.z > abs.x && abs.z > abs.y) { axis = 'z'; value = dz; }

            if (isNaN(value)) value = 0.0;

            const labelText = `Δ${axis.toUpperCase()}: ${value.toFixed(1)} mm`;

            ctx.fillStyle = 'white';
            ctx.font = 'bold 42px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 6;
            ctx.fillText(labelText, canvas.width / 2, canvas.height / 2);

            
        };


        this.drawLabelText();
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

        transformControls.addEventListener('mouseDown', () => {
            controls.enabled = false;
            this.dispatchEvent(new Event("manipulate-start"));

            this.targetObject.getWorldPosition(this.startPos);
            this.labelSprite.visible = true;   
            this.drawLabelText(new Vector3()); 
            this.labelTexture.needsUpdate = true;
        });

        transformControls.addEventListener('change', () => {
            this.solve();
            if (!this.labelSprite.visible) return;

            const currentPos = new Vector3();
            this.targetObject.getWorldPosition(currentPos);
            const delta = currentPos.clone().sub(this.startPos);

            this.drawLabelText(delta);
            this.labelTexture.needsUpdate = true;
        });

        transformControls.addEventListener('mouseUp', () => {
            controls.enabled = true;
            this.dispatchEvent(new Event("manipulate-end"));

            this.labelSprite.visible = false; 
        });
    }

    _loadUrdf(pkg, urdf) {
        super._loadUrdf(pkg, urdf);
    }

    init() {
        function deg_to_rad(deg) {
            var pi = Math.PI;
            return deg * (pi / 180);
        }
        const robot = this.robot;
        robot.updateMatrixWorld(true);

        // Init IK root
        // Clear the degrees of freedom to lock the root of the model
        const ik = urdfRobotToIKRoot(robot);
        setUrdfFromIK(robot, ik);
        ik.clearDoF();
        this.ikRoot = ik;

        // Set the joint angles for typical start poses according to URDF
        const jointNames = Object.keys(robot.joints);
        const urdfName = robot.name ? robot.robotName.toLowerCase() : '';
        if (urdfName.includes('eva_description')) {
            robot.setJointValue(jointNames[1], 0);
            robot.setJointValue(jointNames[2], deg_to_rad(-90));
            robot.setJointValue(jointNames[3], 0);
            robot.setJointValue(jointNames[4], deg_to_rad(-90));
            robot.setJointValue(jointNames[5], 0);
        } else if (urdfName.includes('ur5')) {
            robot.setJointValue(jointNames[1], -1.57);
            robot.setJointValue(jointNames[2], 1.57);
            robot.setJointValue(jointNames[3], 0);
            robot.setJointValue(jointNames[4], 0);
            robot.setJointValue(jointNames[5], 0);
        } else if (urdfName.includes('fr3')) {
            robot.setJointValue(jointNames[0], 0);
            robot.setJointValue(jointNames[1], 0);
            robot.setJointValue(jointNames[2], 0);
            robot.setJointValue(jointNames[3], 0);
            robot.setJointValue(jointNames[4], deg_to_rad(-90));
            robot.setJointValue(jointNames[5], 0);
            robot.setJointValue(jointNames[6], deg_to_rad(90));
            robot.setJointValue(jointNames[7], deg_to_rad(-45));
            robot.setJointValue(jointNames[8], 0);
        } else {
            // Default: all to 0
            for (let i = 1; i < jointNames.length; ++i) {
                robot.setJointValue(jointNames[i], 0.0);
            }
        }

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
        // Reset the goal
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
    }

    solve() {
        const goal = this.goal;
        const ik = this.ikRoot;
        const robot = this.robot;

        // Set the goal and IK
        goal.setPosition(...this.targetObject.position);
        goal.setQuaternion(...this.targetObject.quaternion);
        setIKFromUrdf(ik, robot);

        // Solve IK
        const result = this.solver.solve();
        if (!result.includes(SOLVE_STATUS.DIVERGED)) {
            setUrdfFromIK(robot, ik);
            this.dispatchEvent(new Event('angle-change'));
        }

        this.redraw();
    }
}
