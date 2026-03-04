import { Vector3 } from "three";
import { getFormattedJointString } from "../ui/robotUiState";

/**
 * Per-robot MCP helpers for sending and receiving TCP pose and joint data.
 * Each robot has its own WebSocket to the MCP backend, keeping sockets scoped.
 */

/**
 * Open an MCP socket for this robot to send/receive TCP pose and joint angles.
 * @param {Object} robotRecord - Robot record with connectivity state.
 */
function setup_mcp_socket(robotRecord) {
    if (!robotRecord) return;
    const { connectivity } = robotRecord.state;
    if (connectivity.socketMcp) {
        console.warn(`[${robotRecord.id}] MCP socket already open for this robot.`);
        return;
    }

    connectivity.socketMcp = new WebSocket("ws://127.0.0.1:8000/ws_mcp");
    connectivity.status = 'connecting';

    connectivity.socketMcp.onopen = () => {
        console.log(`[${robotRecord.id}] MCP WebSocket connection established.`);
        connectivity.status = 'connected';
        connectivity.socketMcp.send("status");
    };

    connectivity.socketMcp.onmessage = (event) => {
        const data = event.data;
        console.log(`[${robotRecord.id}] MCP Message from server:`, data);

        const manipulator = robotRecord.manipulator;
        if (!manipulator) return;
        let r = manipulator.robot;

        if (event.data.startsWith("TCP_POS|")) {
            let tcp_coords = event.data.replace("TCP_POS|", "").split(",");
            let position = new Vector3(
                parseFloat(tcp_coords[0]),
                parseFloat(tcp_coords[1]),
                parseFloat(tcp_coords[2])
            )
            manipulator.targetObject.position.set(...position);
            // console.log('Target pos2:', manipulator.targetObject.position);
            manipulator.solve();
            manipulator.dispatchEvent(new Event('manipulate-end'));
            manipulator.dispatchEvent(new Event('change'));

        } else if (event.data.startsWith("JOINTS|")) {
            let joint_raw_data = event.data.replace("JOINTS|", "").replace("°", "").split(", ");

            const jointValuesRad = {};
            let idx = 0;

            for (const name in r.joints) {
                const joint = r.joints[name];
                if (joint.jointType === 'revolute') {
                    jointValuesRad[name] = joint_raw_data[idx] / 180 * Math.PI;
                    idx++;
                }
            }

            manipulator.setJointValues(jointValuesRad);
        }
    };

    connectivity.socketMcp.onerror = (error) => {
        console.error(`[${robotRecord.id}] MCP WebSocket error:`, error);
        connectivity.status = 'error';
    };

    connectivity.socketMcp.onclose = () => {
        console.log(`[${robotRecord.id}] MCP WebSocket connection closed.`);
        connectivity.status = 'disconnected';
        connectivity.socketMcp = null;
    };
}

/**
 * Close the MCP socket for this robot only.
 * @param {Object} robotRecord - Robot record with connectivity state.
 */
function disconnect_mcp_socket(robotRecord) {
    if (!robotRecord) return;

    const robotId = robotRecord.id;
    const { connectivity } = robotRecord.state

    if (connectivity.socketMcp) {
        connectivity.socketMcp.close();
        connectivity.socketMcp = null;
        connectivity.status = 'disconnected';
        console.log(`[${robotId}] MCP WebSocket disconnected successfully.`);
    }
}

/**
 * Turn MCP integration on/off for this robot based on the checkbox.
 * @param {Object} robotRecord - Robot record with connectivity state.
 * @param {Event} event - Checkbox event.
 */
export function toggleMcpIntegration(robotRecord, event) {
    if (!robotRecord) return;
    if (event.target.checked) {
        setup_mcp_socket(robotRecord);
        robotRecord.opcua.syncEnabled = true;
    } else {
        disconnect_mcp_socket(robotRecord);
        robotRecord.opcua.syncEnabled = false;
    }
}

/**
 * Send current TCP pose and joint string to the MCP backend for this robot.
 * @param {Object} robotRecord - Robot record with manipulator state.
 */
export function sendMcpRobotStateUpdate(robotRecord) {
    const manipulator = robotRecord.manipulator;
    const { connectivity } = robotRecord.state;

    // Check if the specific socket for this robot is open
    if (!connectivity.socketMcp || connectivity.socketMcp.readyState !== WebSocket.OPEN) return;
    if (!manipulator || !manipulator.robot) return;

    connectivity.socketMcp.send('TCP|' + 'Pos: ' + manipulator.targetObject.position.toArray().map(coord => coord.toFixed(3)).join(', ') + ' ;Rot: ' + manipulator.targetObject.quaternion.toArray().map(coord => coord.toFixed(3)).join(', '));
    const jointValues = getFormattedJointString(robotRecord);
    connectivity.socketMcp.send('ANGLES|' + jointValues.join(', '));
}
