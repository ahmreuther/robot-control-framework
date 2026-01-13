let nextId = 1;
const robots = new Map();
let statusListener = null;
let manipulatorFactory = null; // set once from UI layer

function attachManipulator(record, manipulator) {
  if (!record) return null;
  record.manipulator = manipulator || null;
  return record.manipulator;
}

function detachManipulator(record) {
  if (!record?.manipulator) return;
  try {
    record.manipulator.remove?.();
  } finally {
    record.manipulator = null;
  }
}

function getNextSlotIndex() {
  const used = new Set();
  robots.forEach(r => {
    if (Number.isFinite(r?.slotIndex)) used.add(r.slotIndex);
  });

  let slot = 0;
  while (used.has(slot)) slot += 1;
  return slot;
}

// Dummy OPC UA API -> replace with real backend calls later!! TODO
// We create a fake session, with a unique sessionId per robot model. This is just for testing. Then we close it.
const opcuaApi = {
  async openSession(model) {
    return { sessionId: `dummy-session-${Date.now()}`, model };
  },

  async closeSession(sessionId) {
    let closed = false;

    if (sessionId != null) {
        closed = true;
    }
    return { closed: closed };
},
};

function notifyStatus(robotId, status) {
  if (typeof statusListener === 'function') {
    statusListener(robotId, status);
  }
}

export function setStatusListener(listener) {
  statusListener = typeof listener === 'function' ? listener : null;
}

export function setManipulatorFactory(factoryFn) {
  manipulatorFactory = typeof factoryFn === 'function' ? factoryFn : null;
}

export function listRobots() {
  return Array.from(robots.values());
}

export function getRobot(robotId) {
  return robots.get(robotId) || null;
}

export async function addRobot({
  model,
  urdfPath,
  sceneNode,
  slotIndex,
  createManipulator = true,
}) {
  const assignedSlot = Number.isFinite(slotIndex) ? slotIndex : getNextSlotIndex();
  const id = `robot-${nextId++}`;
  const record = {
    id,
    model,
    urdfPath,
    sceneNode: sceneNode || null,
    slotIndex: assignedSlot,
    manipulator: null,
    opcuaSessionId: null,
    status: 'connecting',
  };
  robots.set(id, record);
  if (createManipulator) {
    const factory = manipulatorFactory;
    if (typeof factory !== 'function') {
      throw new Error('addRobot requires a manipulator factory. Call setManipulatorFactory first.');
    }
    const manipulator = factory(record) || null;
    if (manipulator) attachManipulator(record, manipulator);
  }
  notifyStatus(id, record.status);

  try {
    const session = await opcuaApi.openSession(model);
    record.opcuaSessionId = session.sessionId;
    record.status = 'connected';
    notifyStatus(id, record.status);

  } catch (err) {
    record.status = 'error';
    record.error = err;
    notifyStatus(id, record.status);
  }

  return record;
}

export async function removeRobot(robotId) {
  const record = robots.get(robotId);
  if (!record) return false;

  try {
    if (record.opcuaSessionId) {
      await opcuaApi.closeSession(record.opcuaSessionId);
    }
    detachManipulator(record);

  } finally {
    robots.delete(robotId);
    notifyStatus(robotId, 'removed');
  }

  return true;
}

export function clearAll() {
  robots.forEach(r => detachManipulator(r));
  robots.clear();
  nextId = 1;
  notifyStatus(null, 'cleared');
}

export { getNextSlotIndex };
