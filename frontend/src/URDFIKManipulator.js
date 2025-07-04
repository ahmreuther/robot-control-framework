import URDFManipulator from 'urdf-loader/src/urdf-manipulator-element.js'
import { Goal, Link, SOLVE_STATUS, SOLVE_STATUS_NAMES, Joint, DOF, setUrdfFromIK, setIKFromUrdf, urdfRobotToIKRoot, Solver, IKRootsHelper } from '@ai-in-process-automation/closed-chain-ik';
import { quat } from 'gl-matrix';

export default
    class URDFIKManipulator extends URDFManipulator {
    constructor(...args) {
        super(...args);
        console.log("TEST")
    }

    test() {


        // Create links and joints
        const link1 = new Link();

        const joint1 = new Joint();
        joint1.setDoF(DOF.EZ);
        joint1.setPosition(0, 1, 0);
        joint1.setDoFValues(Math.PI / 4);

        const link2 = new Link();

        const joint2 = new Joint();
        joint2.setDoF(DOF.EX);
        joint2.setPosition(0, 1, 0);
        joint2.setDoFValues(Math.PI / 4);

        const link3 = new Link();
        link3.setPosition(0, 1, 0);

        // Create the goal
        const goal2 = new Goal();
        link3.getWorldPosition(goal2.position);
        link3.getWorldQuaternion(goal2.quaternion);

        // Create structure
        link1.addChild(joint1);
        joint1.addChild(link2);
        link2.addChild(joint2);
        joint2.addChild(link3);

        goal2.makeClosure(link3);

        // create solver
        console.log(link1);
        const solver2 = new Solver(link1);
        solver2.maxIterations = 3;
        solver2.translationErrorClamp = 0.25;
        solver2.rotationErrorClamp = 0.25;
        solver2.restPoseFactor = 0.01;
        solver2.divergeThreshold = 0.05;

        // ...

        // move the goal around and solve
        const temp2 = solver2.solve();

        console.log(SOLVE_STATUS_NAMES[temp2]);








        const urdf = this.robot
        // console.log(urdf)
        const ik = urdfRobotToIKRoot(urdf);
        setIKFromUrdf(ik, urdf);

        // make the root fixed
        ik.clearDoF();
        quat.fromEuler(ik.quaternion, - 90, 0, 0);
        ik.position[1] -= 0.5;
        ik.setMatrixNeedsUpdate();

        // start the joints off at reasonable angles
        urdf.setJointValue('arm_joint2', - Math.PI / 2);
        urdf.setJointValue('arm_joint3', Math.PI);
        urdf.setJointValue('arm_joint4', Math.PI);
        // urdf.setJointValue( 'joint_5', - Math.PI / 4 );
        setIKFromUrdf(ik, urdf);

        const tool = ik.find(l => l.name === 'tool_point');
        const link = urdf.links.tool_point;

        const goal = new Goal()
        goal.name = link.name;
        tool.getWorldPosition(goal.position);
        tool.getWorldQuaternion(goal.quaternion);

        goal.makeClosure(tool);

        // setUrdfFromIK(urdf, ik);
        ik.updateMatrix();

        console.log(ik);

        const solver = new Solver(ik);
        solver.maxIterations = 3;
        solver.translationErrorClamp = 0.25;
        solver.rotationErrorClamp = 0.25;
        solver.restPoseFactor = 0.01;
        solver.divergeThreshold = 0.05;
        const temp = solver.solve();

        console.log(SOLVE_STATUS_NAMES[temp]);

        // this.scene.add(urdfRoot, ikHelper, drawThroughIkHelper);
        // this.scene.add(urdfRoot);
        // this.redraw();
    }
}