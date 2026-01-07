// Minimal Robot Manager to track multiple robots and OPC UA sessions

let nextId = 1;
const robots = new Map();
let statusListener = null;

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
  if (typeof statusListener === 'function'){
     statusListener(robotId, status);
  }
}

export function setStatusListener(listener) {
    statusListener = null;
    if (listener && typeof listener === 'function'){
        statusListener = listener;
    }
}

export function listRobots() {
  return Array.from(robots.values());
}

export function getRobot(robotId) {
  return robots.get(robotId) || null;
}

export async function addRobot({ model, urdfPath, sceneNode }) {
  const id = `robot-${nextId++}`;
  const record = {
    id,
    model,
    urdfPath,
    sceneNode: sceneNode || null,
    opcuaSessionId: null,
    status: 'connecting',
  };
  robots.set(id, record);
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
  } finally {
    robots.delete(robotId);
    notifyStatus(robotId, 'removed');
  }

  return true;
}

export function clearAll() {
  robots.clear();
  nextId = 1;
  notifyStatus(null, 'cleared');
}
