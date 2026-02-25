class RobotManager {
    constructor() {
        this.nextId = 1;
        this.robots = new Map();
        this.statusListener = null;
        this.manipulatorFactory = null; // set once from UI layer
        this.activeRobotId = null;
        this.globalSocket = null;
    }

    setGlobalSocket(socket) {
        this.globalSocket = socket;
        // Update existing robots with the new socket reference
        this.robots.forEach(robot => {
            if (robot.state && robot.state.connectivity) {
                robot.state.connectivity.socket = socket;
            }
        });
    }

    setActiveRobot(robotId) {
        if (robotId && this.robots.has(robotId)) {
            this.activeRobotId = robotId;
        } else {
            this.activeRobotId = null;
        }
    }

    getActiveRobot() {
        return this.activeRobotId ? this.getRobot(this.activeRobotId) : null;
    }

    attachManipulator(record, manipulator) {
        if (!record) return null;
        record.manipulator = manipulator || null;
        return record.manipulator;
    }

    detachManipulator(record) {
        if (!record?.manipulator) return;
        try {
            record.manipulator.remove?.();
        } finally {
            record.manipulator = null;
        }
    }

    getNextSlotIndex() {
        const used = new Set();
        this.robots.forEach(r => {
            if (Number.isFinite(r?.slotIndex)) used.add(r.slotIndex);
        });

        let slot = 0;
        while (used.has(slot)) slot += 1;
        return slot;
    }

    notifyStatus(robotId, status) {
        if (typeof this.statusListener === 'function') {
            this.statusListener(robotId, status);
        }
    }

    setStatusListener(listener) {
        this.statusListener = typeof listener === 'function' ? listener : null;
    }

    setManipulatorFactory(factoryFn) {
        this.manipulatorFactory = typeof factoryFn === 'function' ? factoryFn : null;
    }

    listRobots() {
        return Array.from(this.robots.values());
    }

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

            //global attributes from funcitionalities.js now per robot
            state: {
                connectivity: {
                    socket: this.globalSocket, //backend opcua socket
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

        // create manipulator
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

    async removeRobot(robotId) {
        const record = this.robots.get(robotId);
        if (!record) return false;

        try {
            // Shared global socket must NOT be closed when removing a single robot
            // if (record.state.connectivity.socket) {
            //     record.state.connectivity.socket.close();
            // }
            this.detachManipulator(record);

        } finally {
            this.robots.delete(robotId);
            this.notifyStatus(robotId, 'removed');
        }
        
        return true;
    }

    clearAll() {
        this.robots.forEach(r => this.detachManipulator(r));
        this.robots.clear();
        this.nextId = 1;
        this.notifyStatus(null, 'cleared');
    }

}

// Create a default singleton instance to preserve existing module semantics.
const robotManager = new RobotManager();

// Export functions bound to the singleton instance so existing imports keep working.
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
// Small built-in catalog of known robot models used by the UI.
// Kept here to avoid an extra config file while still centralizing model metadata.
export const robotModels = [
    { name: "EVA", urdf: "/urdf/eva_description/urdf/eva_description.urdf", color: "#546575" },
    { name: "FR3", urdf: "/urdf/fr3_description/urdf/fr3.urdf", color: "#567554" },
    { name: "FR3 + Wagon", urdf: "/urdf/fr3_description_with_wagon/urdf/fr3.urdf", color: "#567554" },
    { name: "UR5e", urdf: "/urdf/ur5_description/urdf/ur5_robot.urdf", color: "#aaaab3" },
];

export default robotManager;

