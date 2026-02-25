// Utils: Extract URDF joints from viewer
function normalizeMapLike(mapLike) {
    const out = {};
    if (!mapLike) return out;
    if (typeof mapLike.forEach === 'function') {
        mapLike.forEach((v, k) => out[String(k)] = v);
    } else if (typeof mapLike === 'object') {
        for (const k in mapLike) out[k] = mapLike[k];
    }
    return out;
}

function urdfJointsArray(robotRecord) {
    const manipulator = robotRecord.manipulator;

    const raw = manipulator?.robot?.joints || null;
    const obj = normalizeMapLike(raw);
    const arr = [];
    for (const name in obj) {
        const j = obj[name];
        arr.push({
            name,
            type: String(j.jointType || j._jointType || j.type || '').toLowerCase(),
            parent: j.parent || null,
            child: j.child || null,
            angleRad: Number(Array.isArray(j.jointValue) ? j.jointValue[0] : j.angle) || 0,
            _raw: j
        });
    }
    return arr;
}

function isRevoluteType(t) {
    t = String(t || '').toLowerCase();
    return t === 'revolute' || t === 'continuous';
}

export function isPrismaticType(t) {
    t = String(t || '').toLowerCase();
    return t === 'prismatic';
}

export function getJointLimits(j) {
    // robustes Auslesen, je nach Parser
    const lim = j?.limit || j?._limit || j?._raw?.limit || {};
    const toNum = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));
    return {
        lower: toNum(lim.lower ?? lim.min),
        upper: toNum(lim.upper ?? lim.max),
        effort: lim.effort !== undefined ? toNum(lim.effort) : undefined,
        velocity: lim.velocity !== undefined ? toNum(lim.velocity) : undefined,
    };
}

// Adjacency: parentLink -> [JointObjects]
function buildAdjacency(jointsArr) {
    const adj = new Map();
    for (const j of jointsArr) {
        if (!j.parentLink || !j.childLink) continue;
        if (!adj.has(j.parentLink)) adj.set(j.parentLink, []);
        adj.get(j.parentLink).push(j);
    }
    return adj;
}

/**
 *Revolute order from base joint (BFS along the chain))
 */
export function orderedRevoluteFromBaseJoint(robotRecord, baseJoint) {
    const jointsArr = urdfJointsArray(robotRecord);
    const adj = buildAdjacency(jointsArr);
    const order = [];

    if (!baseJoint) return order;

    if (isRevoluteType(baseJoint.type)) order.push(baseJoint.name);

    const seenLinks = new Set();
    const q = [baseJoint.childLink];
    seenLinks.add(baseJoint.childLink);

    while (q.length) {
        const link = q.shift();
        const edges = adj.get(link) || [];
        edges.sort((a, b) => a.name.localeCompare(b.name));
        for (const e of edges) {
            if (isRevoluteType(e.type)) order.push(e.name);
            if (!seenLinks.has(e.childLink)) {
                seenLinks.add(e.childLink);
                q.push(e.childLink);
            }
        }
    }
    return order;
}

export function getOrderedRevoluteJoints(robotRecord) {
    const manipulator = robotRecord.manipulator;

    if (!manipulator || !manipulator.robot || !manipulator.robot.joints) {
        console.warn("⚠️ manipulator.robot.joints missing.");
        return [];
    }


    const allJoints = Object.values(manipulator.robot.joints);

    // Find base = joint whose parent is directly manipulator.robot
    const baseCandidates = allJoints.filter(j => j.parent === manipulator.robot);
    if (baseCandidates.length === 0) {
        console.warn("⚠️ No Base-Joint found.");
        return [];
    }
    const base = baseCandidates[0]; // if there are several -> take the first one


    // Now run along the child chain
    const ordered = [];
    let current = base;

    while (current) {
        if (current.jointType === "revolute" || current.jointType === "continuous") {
            ordered.push(current);
        }
        // continue via child → search for joint there that has this link as parent
        const childLink = current.child;
        if (!childLink) break;
        const next = allJoints.find(j => j.parent === childLink);
        current = next || null;
    }

    return ordered;
}

export function getOrderedRevoluteJointNames(robotRecord) {
    const manipulator = robotRecord.manipulator;

    if (!manipulator || !manipulator.robot || !manipulator.robot.joints) {
        console.warn("⚠️ manipulator.robot.joints missing.");
        return [];
    }

    const ordered = [];
    let currentJoint = null;

    // Base-Joint = the first URDFJoint under URDFRobot
    for (const child of manipulator.robot.children) {
        if (child.type === "URDFJoint") {
            currentJoint = child;
            break;
        }
    }

    while (currentJoint) {
        const jointName = currentJoint.name;
        const jointObj = manipulator.robot.joints[jointName];

        if (jointObj && (jointObj.jointType === "revolute" || jointObj.jointType === "continuous")) {
            ordered.push(jointName);
        }

        // Find the next joint: currentJoint.children[0] is URDFLink,
        // and its children contain another URDFJoint
        let nextJoint = null;
        if (currentJoint.children && currentJoint.children.length > 0) {
            const urdfLink = currentJoint.children.find(c => c.type === "URDFLink");
            if (urdfLink && urdfLink.children) {
                nextJoint = urdfLink.children.find(c => c.type === "URDFJoint") || null;
            }
        }

        currentJoint = nextJoint;
    }

    return ordered;
}
