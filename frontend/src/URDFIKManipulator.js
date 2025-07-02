import URDFManipulator from 'urdf-loader/src/urdf-manipulator-element.js'
import { Goal, Link, Joint, setUrdfFromIK, setIKFromUrdf, urdfRobotToIKRoot } from '@ai-in-process-automation/closed-chain-ik';
import { quat } from 'gl-matrix';

export default
class URDFIKManipulator extends URDFManipulator {
    constructor(...args) {
        super(...args);
        console.log("TEST")
    }

    test() {
        const goal = new Goal()
        goal.setPosition(1,1,1)
        const urdf = this.robot
        console.log(urdf)
        const ik = urdfRobotToIKRoot( urdf );

        // make the root fixed
        ik.clearDoF();
        quat.fromEuler( ik.quaternion, - 90, 0, 0 );
        ik.position[ 1 ] -= 0.5;
        ik.setMatrixNeedsUpdate();

        // start the joints off at reasonable angles
        urdf.setJointValue( 'joint_2', - Math.PI / 2 );
        urdf.setJointValue( 'joint_3', Math.PI );
        urdf.setJointValue( 'joint_4', Math.PI );
        // urdf.setJointValue( 'joint_5', - Math.PI / 4 );
        setIKFromUrdf( ik, urdf );

        const goalMap = new Map();
        const tool = ik.find( l => l.name === 'toolpoint_fixed_joint' );
        const link = urdf.links.tool_point;

        const ee = new Joint();
        ee.name = link.name;
        ee.makeClosure( tool );

        tool.getWorldPosition( ee.position );
        tool.getWorldQuaternion( ee.quaternion );
        ee.setMatrixNeedsUpdate();
        goalMap.set( ee, tool );

        this.redraw();
    }
}