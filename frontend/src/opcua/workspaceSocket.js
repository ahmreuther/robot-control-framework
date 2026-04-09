import { Vector3 } from 'three';
import { getBackendWsUrl } from '../network/host.js';

const PCD2_MAGIC = 'PCD2';
const PCD2_HEADER_BYTES = 52;
const pcdAssemblies = new Map();

let workspaceSocket = null;

function ensureAsm(seqId, totalPoints, chunkCount, min, scale, kind = 'unknown') {
    let asm = pcdAssemblies.get(seqId);
    if (!asm) {
        asm = {
            totalPoints,
            chunkCount,
            got: 0,
            min,
            scale,
            kind,
            qbuf: new Uint16Array(totalPoints * 3),
        };
        pcdAssemblies.set(seqId, asm);
        return asm;
    }

    if (!asm.qbuf) {
        asm.qbuf = new Uint16Array(totalPoints * 3);
    }

    asm.totalPoints = totalPoints;
    asm.chunkCount = chunkCount;
    asm.got = 0;
    asm.min = min;
    asm.scale = scale;
    if (kind !== 'unknown') {
        asm.kind = kind;
    }
    return asm;
}

function dequantizeToVector3Array(asm) {
    const pts = new Array(asm.totalPoints);
    const minx = asm.min[0];
    const miny = asm.min[1];
    const minz = asm.min[2];
    const sx = asm.scale[0];
    const sy = asm.scale[1];
    const sz = asm.scale[2];

    const q = asm.qbuf;
    for (let i = 0; i < asm.totalPoints; i += 1) {
        const qx = q[i * 3];
        const qy = q[i * 3 + 1];
        const qz = q[i * 3 + 2];
        pts[i] = new Vector3(minx + qx * sx, miny + qy * sy, minz + qz * sz);
    }

    return pts;
}

function handlePCD2ArrayBuffer(buf) {
    const dv = new DataView(buf);
    const magic = String.fromCharCode(
        dv.getUint8(0),
        dv.getUint8(1),
        dv.getUint8(2),
        dv.getUint8(3),
    );

    if (magic !== PCD2_MAGIC) {
        return;
    }

    const seqId = dv.getUint32(4, true);
    const chunkCount = dv.getUint32(12, true);
    const totalPoints = dv.getUint32(16, true);
    const startIndex = dv.getUint32(20, true);
    const minx = dv.getFloat32(28, true);
    const miny = dv.getFloat32(32, true);
    const minz = dv.getFloat32(36, true);
    const sx = dv.getFloat32(40, true);
    const sy = dv.getFloat32(44, true);
    const sz = dv.getFloat32(48, true);

    const existingAsm = pcdAssemblies.get(seqId);
    const asm = ensureAsm(
        seqId,
        totalPoints,
        chunkCount,
        [minx, miny, minz],
        [sx, sy, sz],
        existingAsm?.kind,
    );

    const data = new Uint16Array(buf, PCD2_HEADER_BYTES);
    asm.qbuf.set(data, startIndex * 3);
    asm.got += 1;

    if (asm.got < asm.chunkCount) return;

    try {
        const pts = dequantizeToVector3Array(asm);
        const viewer = document.querySelector('urdf-viewer');
        if (viewer && window.showRawPointCloud) {
            window.showRawPointCloud(viewer, pts, { size: 0.01, opacity: 0.9 });
        }
    } finally {
        pcdAssemblies.delete(seqId);
    }
}

function initWorkspaceSocket() {
    if (workspaceSocket) {
        return workspaceSocket;
    }

    workspaceSocket = new WebSocket(getBackendWsUrl('/ws_workspace'));
    workspaceSocket.binaryType = 'arraybuffer';
    window.__WS_PCD__ = workspaceSocket;

    workspaceSocket.addEventListener('open', () => {
        console.log('[workspaceSocket] Workspace WS open:', workspaceSocket.url);
        window.dispatchEvent(new CustomEvent('ws-ready', { detail: { socket: workspaceSocket } }));
    });

    workspaceSocket.addEventListener('error', (event) => {
        console.log('[workspaceSocket] Workspace WS error', event);
    });

    workspaceSocket.addEventListener('close', () => {
        console.log('[workspaceSocket] Workspace WS close');
        if (window.__WS_PCD__ === workspaceSocket) {
            window.__WS_PCD__ = null;
        }
        workspaceSocket = null;
    });

    workspaceSocket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') return;
        if (event.data instanceof ArrayBuffer) {
            handlePCD2ArrayBuffer(event.data);
        } else if (event.data?.arrayBuffer) {
            event.data.arrayBuffer().then(handlePCD2ArrayBuffer).catch((err) => {
                console.warn('[workspaceSocket] Failed to read binary message', err);
            });
        }
    });

    return workspaceSocket;
}

export function getWorkspaceSocket() {
    return workspaceSocket || window.__WS_PCD__ || initWorkspaceSocket();
}

initWorkspaceSocket();
