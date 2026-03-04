/**
 * Multi-robot registry. Keeps per-robot state, assigns scene slots, reuses one OPC UA socket,
 * and builds manipulators via a factory. Keep new code per robot.
 */
class RobotManager {
    /**
     * Create a new robot manager instance.
     */
    constructor() {
        this.nextId = 1;
        this.robots = new Map();
        this.statusListener = null;
        this.manipulatorFactory = null; // set once from UI layer
        this.activeRobotId = null;
        this.globalSocket = null;
    }

    /**
     * Share one OPC UA WebSocket across robots.
     * @param {WebSocket} socket - Shared socket instance.
     */
    setGlobalSocket(socket) {
        this.globalSocket = socket;
        // Update existing robots with the new socket reference
        this.robots.forEach(robot => {
            if (robot.state && robot.state.connectivity) {
                robot.state.connectivity.socket = socket;
            }
        });
    }

    /**
     * Mark which robot is focused in the UI.
     * @param {string|null} robotId - Robot id to set active.
     */
    setActiveRobot(robotId) {
        if (robotId && this.robots.has(robotId)) {
            this.activeRobotId = robotId;
        } else {
            this.activeRobotId = null;
        }
    }

    /**
     * Get the currently focused robot.
     * @returns {Object|null}
     */
    getActiveRobot() {
        return this.activeRobotId ? this.getRobot(this.activeRobotId) : null;
    }

    /**
     * Attach a manipulator to a record.
     * @param {Object} record - Robot record.
     * @param {Object|null} manipulator - Manipulator instance.
     * @returns {Object|null}
     */
    attachManipulator(record, manipulator) {
        if (!record) return null;
        record.manipulator = manipulator || null;
        return record.manipulator;
    }

    /**
     * Remove and dispose the manipulator for a record.
     * @param {Object} record - Robot record.
     */
    detachManipulator(record) {
        if (!record?.manipulator) return;
        try {
            record.manipulator.remove?.();
        } finally {
            record.manipulator = null;
        }
    }

    /**
     * Find the next free slot so robots line up in the scene.
     * @returns {number}
     */
    getNextSlotIndex() {
        const used = new Set();
        this.robots.forEach(r => {
            if (Number.isFinite(r?.slotIndex)) used.add(r.slotIndex);
        });

        let slot = 0;
        while (used.has(slot)) slot += 1;
        return slot;
    }

    /**
     * Notify a listener about status changes.
     * @param {string|null} robotId - Robot id.
     * @param {string} status - New status string.
     */
    notifyStatus(robotId, status) {
        if (typeof this.statusListener === 'function') {
            this.statusListener(robotId, status);
        }
    }

    /**
     * Register a listener for status changes.
     * @param {Function|null} listener - Status listener callback.
     */
    setStatusListener(listener) {
        this.statusListener = typeof listener === 'function' ? listener : null;
    }

    /**
     * Store the manipulator factory used when creating robots.
     * @param {Function|null} factoryFn - Factory function.
     */
    setManipulatorFactory(factoryFn) {
        this.manipulatorFactory = typeof factoryFn === 'function' ? factoryFn : null;
    }

    /**
     * Return all robot records.
     * @returns {Object[]}
     */
    listRobots() {
        return Array.from(this.robots.values());
    }

    /**
     * Get a robot by id or connected URL.
     * @param {string} robotIdOrUrl - Robot id or connected URL.
     * @returns {Object|null}
     */
    getRobot(robotIdOrUrl) {
        // check for id first
        if (this.robots.has(robotIdOrUrl)) {
            return this.robots.get(robotIdOrUrl);
        }
    
        // check for url
        for (let robot of this.robots.values()) {
            if (robot.state?.connectivity?.connectedUrl === robotIdOrUrl) {
                return robot;
            }
        }
    return null;
    }

    /**
     * Create a new robot record with optional manipulator.
     * @param {Object} options - Add robot options.
     * @returns {Promise<Object>}
     */
    async addRobot({ model, urdfPath, sceneNode, slotIndex, createManipulator = true, }) {
        const assignedSlot = Number.isFinite(slotIndex) ? slotIndex : this.getNextSlotIndex();
        const id = `robot-${this.nextId++}`;

        const record = {
            id,
            model,
            urdfPath,
            sceneNode: sceneNode || null,
            slotIndex: assignedSlot,
            manipulator: null,

            /* Per-robot state mirrors the former globals so older listeners keep working; extend carefully. */
            state: {
                connectivity: {
                    socket: this.globalSocket, // backend opcua socket
                    socketMcp: null,
                    connectedUrl: null,
                    status: 'disconnected',
                    isConnected: false
                },
                opcua: {
                    syncEnabled: false,
                    streamActive: false,
                    lastAngles: null,
                    lastEEFPositions: null,
                    axisToJointMap: null,
                    endEffectorMap: null,
                    hasRoboticsNamespace: false,
                    gotoMethodNodeId: null,
                    toggleEndEffMethodNodeId: null,
                },
                interaction: {
                    isManipulating: false,
                    isMouseDownOnJoint: false
                },
                ui: {
                    addressSpaceHTML: null,
                    selectedNodeId: null,
                    selectedNodeElement: null,
                    showSubscriptionsTabOnNextCustom: false,
                    // Persistent UI state per robot
                    subscriptions: new Map(), // nodeId -> value
                    events: [],               // strings (HTML/Text)
                    references: [],           // array of objects
                    properties: {}            // key-value object
                },
                robotInfo: {
                    manufacturer: null,
                    model: null,
                    serialNumber: null,
                    mode: null,
                    lastMode: null
                }
            }
        };


        this.robots.set(id, record);

        // Create the manipulator for this record if requested.
        if (createManipulator) {
            const factory = this.manipulatorFactory;
            if (typeof factory !== 'function') {
                throw new Error('addRobot requires a manipulator factory. Call setManipulatorFactory first.');
            }
            const manipulator = factory(record) || null;
            if (manipulator) {
                this.attachManipulator(record, manipulator);
            }
        }
        this.notifyStatus(id, record.state.connectivity.status);


        return record;
    }

    /**
     * Remove a robot record and detach its manipulator; keep shared sockets open.
     * @param {string} robotId - Robot id.
     * @returns {Promise<boolean>}
     */
    async removeRobot(robotId) {
        const record = this.robots.get(robotId);
        if (!record) return false;

        try {
            // Shared global socket must NOT be closed when removing a single robot.
            this.detachManipulator(record);

        } finally {
            this.robots.delete(robotId);
            this.notifyStatus(robotId, 'removed');
        }
        
        return true;
    }

    /**
     * Reset manager: detach all manipulators and clear the registry.
     */
    clearAll() {
        this.robots.forEach(r => this.detachManipulator(r));
        this.robots.clear();
        this.nextId = 1;
        this.notifyStatus(null, 'cleared');
    }

}

/**
 * Create a default singleton instance to preserve existing module semantics.
 */
const robotManager = new RobotManager();

/**
 * Export functions bound to the singleton instance so existing imports keep working.
 */
export const setStatusListener = robotManager.setStatusListener.bind(robotManager);
export const setManipulatorFactory = robotManager.setManipulatorFactory.bind(robotManager);
export const listRobots = robotManager.listRobots.bind(robotManager);
export const getRobot = robotManager.getRobot.bind(robotManager);
export const addRobot = robotManager.addRobot.bind(robotManager);
export const removeRobot = robotManager.removeRobot.bind(robotManager);
export const clearAll = robotManager.clearAll.bind(robotManager);
export const getNextSlotIndex = robotManager.getNextSlotIndex.bind(robotManager);
export const setActiveRobot = robotManager.setActiveRobot.bind(robotManager);
export const getActiveRobot = robotManager.getActiveRobot.bind(robotManager);
export const setGlobalSocket = robotManager.setGlobalSocket.bind(robotManager);
/**
 * Small built-in catalog of known robot models used by the UI.
 * Kept here to avoid an extra config file while still centralizing model metadata.
 */
export const robotModels = [
    { name: "EVA", urdf: "/urdf/eva_description/urdf/eva_description.urdf", color: "#546575" },
    { name: "FR3", urdf: "/urdf/fr3_description/urdf/fr3.urdf", color: "#567554" },
    { name: "FR3 + Wagon", urdf: "/urdf/fr3_description_with_wagon/urdf/fr3.urdf", color: "#567554" },
    { name: "UR5e", urdf: "/urdf/ur5_description/urdf/ur5_robot.urdf", color: "#aaaab3" },
];

export default robotManager;

