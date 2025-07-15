import URDFManipulator from 'urdf-loader/src/urdf-manipulator-element.js'
import { Goal, Link, SOLVE_STATUS, SOLVE_STATUS_NAMES, Joint, DOF, setUrdfFromIK, setIKFromUrdf, urdfRobotToIKRoot, Solver, IKRootsHelper } from '@ai-in-process-automation/closed-chain-ik';
import { quat } from 'gl-matrix';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Object3D, Vector3, Quaternion } from 'three';

export default
    class URDFIKManipulator extends URDFManipulator {
    constructor(...args) {
        super(...args);
        console.log("TEST");

        let controls = this.controls;
        // let robot = this.robot;
        // let ik = null;

        const transformControls = new TransformControls(this.camera, this.renderer.domElement);
        transformControls.setSpace('world');
        transformControls.addEventListener('change', () => this.redraw());
        this.scene.add(transformControls.getHelper());

        const targetObject = new Group();
        // targetObject.position.set( 0, 1, 1 );
        this.world.add(targetObject);
        transformControls.attach(targetObject);
        this.targetObject = targetObject;

        transformControls.addEventListener('dragging-changed', function (event) {
            controls.enabled = !event.value;

        });

        // transformControls.addEventListener('change', function (event) {
        //     console.log("2");
        //     console.log(this.ik);
        //     if (this.ik === null) {
        //         urdfRobotToIKRoot(this.ik, this.robot
        //         );
        //     }
        //     setUrdfFromIK(this.robot, this.ik);
        // });
        this.transformControls = transformControls;
        // this.targetObject = targetObject;

        // transformControls.addEventListener('mouseUp', () => {

        //     const ik = urdfRobotToIKRoot(this.robot);
        //     setUrdfFromIK(this.robot, ik);

        //     const tool = ik.find(l => l.name === 'tool_point');

        //     const goal = new Goal()
        //     goal.name = tool.name;
        //     console.log(this.robot);
        //     tool.getWorldPosition(goal.position);
        //     tool.getWorldQuaternion(goal.quaternion);

        //     // goal.makeClosure(tool);
        //     // tool.updateMatrixWorld();
        //     // targetObject.local
        //     console.log(goal.position);
        //     targetObject.position.set(...goal.position);
        //     targetObject.quaternion.set(...goal.quaternion);
        //     console.log(targetObject.position);


        //     // const solver = new Solver(this.robot.links.base_link);

        //     // const temp = solver.solve();
        //     // console.log(temp);



        //     setUrdfFromIK(this.robot, ik);
        //     this.redraw();
        // });
    }

    _loadUrdf(pkg, urdf) {
        super._loadUrdf(pkg, urdf);
    }

    test() {

        // this.ik = urdfRobotToIKRoot(this.robot);
        // console.log("1");
        // console.log(this.ik);

        // setIKFromUrdf(this.ik, this.robot);
        // setUrdfFromIK(this.robot, this.ik);

        // const tool = this.ik.find(l => l.name === 'tool_point');

        const goal = new Goal();
        // goal.name = tool.name;
        // console.log(this.robot);
        // tool.getWorldPosition(goal.position);
        // tool.getWorldQuaternion(goal.quaternion);

        // console.log(this.robot.links.tool_point.position);

        // this.transformControls.attach(this.robot.links.tool_point);

        const ik = urdfRobotToIKRoot(this.robot);
        ik.clearDoF();
        quat.fromEuler(ik.quaternion, - 90, 0, 0);
        ik.position[1] -= 0.5;
        ik.setMatrixNeedsUpdate();
        ik.updateMatrix();
        ik.updateMatrixWorld();


        console.log(ik);

        const base_link = ik.find(l => l.name === 'base_link');
        const base_link_position = new Vector3();
        base_link.getWorldPosition(base_link_position);
        console.log("Base Link Position: ", base_link_position);

        const tool_point = ik.find(l => l.name === 'tool_point');
        const tool_point_position = new Vector3();
        tool_point.getWorldPosition(tool_point_position);
        console.log("Tool Point Position: ", tool_point_position);

        goal.name = tool_point.name;

        const position = new Vector3();
        const rotation = new Quaternion();
        this.targetObject.getWorldPosition(position);
        this.targetObject.getWorldQuaternion(rotation);

        goal.setWorldPosition(...position);
        goal.setWorldQuaternion(...rotation);

        goal.setMatrixNeedsUpdate();
        goal.setMatrixWorldNeedsUpdate();

        goal.makeClosure(tool_point);

        const temp2 = new Vector3();
        goal.getWorldPosition(temp2);
        console.log("Goal Position: ", temp2);


        const solver = new Solver(ik);

        // solver.maxIterations = 10;
        // solver.translationErrorClamp = 0.25;
        // solver.rotationErrorClamp = 9999999*0.25;
        // solver.restPoseFactor = 0.01;
        // solver.divergeThreshold = 0.5;

        solver.updateStructure();


        const temp = solver.solve();

        console.log(SOLVE_STATUS_NAMES[temp]);

        // goal.makeClosure(tool);
        // tool.updateMatrixWorld();
        // targetObject.local
        // console.log(goal.position);
        // this.targetObject.position.set(...goal.position);
        // this.targetObject.quaternion.set(...goal.quaternion);
        // console.log(this.targetObject.position);


        this.redraw();

        // const urdf = this.robot
        // // console.log(urdf)
        // const ik = urdfRobotToIKRoot(urdf);
        // setIKFromUrdf(ik, urdf);

        // // make the root fixed
        // ik.clearDoF();
        // quat.fromEuler(ik.quaternion, - 90, 0, 0);
        // ik.position[1] -= 0.5;
        // ik.setMatrixNeedsUpdate();

        // // start the joints off at reasonable angles
        // urdf.setJointValue('arm_joint2', - Math.PI / 2);
        // urdf.setJointValue('arm_joint3', Math.PI);
        // urdf.setJointValue('arm_joint4', Math.PI);
        // // urdf.setJointValue( 'joint_5', - Math.PI / 4 );
        // setIKFromUrdf(ik, urdf);

        // const tool = ik.find(l => l.name === 'tool_point');
        // const link = urdf.links.tool_point;

        // const goal = new Goal()
        // goal.name = link.name;
        // tool.getWorldPosition(goal.position);
        // tool.getWorldQuaternion(goal.quaternion);

        // goal.makeClosure(tool);

        // // setUrdfFromIK(urdf, ik);
        // ik.updateMatrix();

        // console.log(ik);

        // const solver = new Solver(ik);
        // solver.maxIterations = 3;
        // solver.translationErrorClamp = 0.25;
        // solver.rotationErrorClamp = 0.25;
        // solver.restPoseFactor = 0.01;
        // solver.divergeThreshold = 0.05;
        // const temp = solver.solve();

        // console.log(SOLVE_STATUS_NAMES[temp]);

        // this.scene.add(urdfRoot, ikHelper, drawThroughIkHelper);
        // this.scene.add(urdfRoot);
        // this.redraw();
    }
}