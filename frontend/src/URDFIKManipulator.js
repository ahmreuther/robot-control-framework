import URDFManipulator from 'urdf-loader/src/urdf-manipulator-element.js'
import { Goal, SOLVE_STATUS, DOF, setUrdfFromIK, setIKFromUrdf, urdfRobotToIKRoot, Solver, SOLVE_STATUS } from 'closed-chain-ik';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Group, SphereGeometry, MeshBasicMaterial, Mesh } from 'three';

export default
    class URDFIKManipulator extends URDFManipulator {
    constructor(...args) {
        super(...args);

        const controls = this.controls;

        // controls
        const transformControls = new TransformControls(this.camera, this.renderer.domElement);
        transformControls.setSpace('world');
        transformControls.addEventListener('change', () => this.redraw());
        transformControls.setSpace('local');
        this.scene.add(transformControls.getHelper());


        const targetObject = new Group();

        const geometry = new SphereGeometry(0.005, 32, 16);
        const material = new MeshBasicMaterial({ color: 0xffff00 });
        const sphere = new Mesh(geometry, material);
        targetObject.add(sphere);

        this.world.add(targetObject);
        let transformControlsEnabled = true;
        transformControls.attach(targetObject);

        // members
        this.transformControls = transformControls;
        this.targetObject = targetObject;
        this.ikRoot = null;
        this.goal = null;
        this.helper = null;
        this.solver = null;

        // events
        transformControls.addEventListener('dragging-changed', function (event) {
            controls.enabled = !event.value;
        });

        transformControls.addEventListener('change', () => this.solve());
        transformControls.addEventListener('mouseUp', () => this.resetGoal());

        transformControls.addEventListener('mouseDown', () => controls.enabled = false);
        transformControls.addEventListener('mouseUp', () => controls.enabled = true);

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
                // Default: alle auf 0
                for (let i = 1; i < jointNames.length; ++i) {
                    robot.setJointValue(jointNames[i], 0.0);
                }
            }

            // Pose übernehmen und IK/Goal synchronisieren
            robot.updateMatrixWorld(true);
            this.dispatchEvent(new Event('angle-change')); // ruft setIKFromUrdf + resetGoal() auf
        });




        this.addEventListener('angle-change', () => {

            setIKFromUrdf(this.ikRoot, this.robot);
            this.resetGoal();

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

        // init ik root
        // clear the degrees of freedom to lock the root of the model
        const ik = urdfRobotToIKRoot(robot);
        setUrdfFromIK(robot, ik);
        ik.clearDoF();
        this.ikRoot = ik;

        // Setze die Gelenkwinkel für typische Start-Posen je nach URDF
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
            // Default: alle auf 0
            for (let i = 1; i < jointNames.length; ++i) {
                robot.setJointValue(jointNames[i], 0.0);
            }
        }

        // setUrdfFromIK(robot, ik);
        setIKFromUrdf(ik, robot)

        // init the goal
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
        // reset the goal
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

        // set the goal and ik
        goal.setPosition(...this.targetObject.position);
        goal.setQuaternion(...this.targetObject.quaternion);
        setIKFromUrdf(ik, robot);

        // solve
        const result = this.solver.solve();
        if (!result.includes(SOLVE_STATUS.DIVERGED)) {
            setUrdfFromIK(robot, ik);
            this.dispatchEvent(new Event('angle-change'));
        }

        this.redraw();
    }
}