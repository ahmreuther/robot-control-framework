/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import * as THREE from 'three';
import type { URDFRobot } from 'urdf-loader/src/URDFClasses';

import { WEBSOCKET_URL } from '../../../app/config/backendEndpoints';

export type WorkspaceResolution = 'low' | 'medium' | 'high';

export const WORKSPACE_RESOLUTIONS: Record<
  WorkspaceResolution,
  { samples: number; voxelSize: number }
> = {
  low: { samples: 1_000_000, voxelSize: 0.02 },
  medium: { samples: 4_000_000, voxelSize: 0.015 },
  high: { samples: 8_000_000, voxelSize: 0.01 },
};

export interface WorkspaceProgress {
  percent: number;
  label: string;
}

export interface WorkspaceGenerateOptions {
  robot: URDFRobot;
  resolution: WorkspaceResolution;
  signal?: AbortSignal;
  onProgress?: (progress: WorkspaceProgress) => void;
}

interface MovableJoint {
  obj: any;
  min: number;
  range: number;
}

interface PcdAssembly {
  totalPoints: number;
  chunkCount: number;
  got: number;
  min: [number, number, number];
  scale: [number, number, number];
  qbuf: Uint16Array;
}

const PCD_HEADER_BYTES = 52;
const WORKSPACE_WS_URL = WEBSOCKET_URL.replace(/\/ws\/?$/, '/ws_workspace');

function createAbortError(message = 'Workspace generation aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function findToolPoint(robot: URDFRobot) {
  let toolPoint: any = null;
  robot.traverse((child: any) => {
    if (child.name === 'tool_point') toolPoint = child;
  });
  if (!toolPoint) {
    robot.traverse((child: any) => {
      if (child.isURDFLink && child.children.length === 0) toolPoint = child;
    });
  }
  return toolPoint;
}

function collectMovableJoints(robot: URDFRobot) {
  const movable: MovableJoint[] = [];
  robot.traverse((child: any) => {
    if (!child.isURDFJoint || child.jointType === 'fixed') return;

    const lo = child.limit && Number.isFinite(child.limit.lower) ? child.limit.lower : -Math.PI;
    const hi = child.limit && Number.isFinite(child.limit.upper) ? child.limit.upper : Math.PI;

    movable.push({
      obj: child,
      min: lo,
      range: hi - lo || 1,
    });
  });
  return movable;
}

function snapshotJointPose(movableJoints: MovableJoint[]) {
  const snapshot = new Map<string, number>();
  for (const joint of movableJoints) {
    snapshot.set(joint.obj.name, joint.obj.angle);
  }
  return snapshot;
}

function applyJointPose(movableJoints: MovableJoint[], snapshot: Map<string, number>) {
  for (const joint of movableJoints) {
    const angle = snapshot.get(joint.obj.name);
    if (angle !== undefined) {
      joint.obj.setJointValue(angle);
    }
  }
}

async function sampleWorkspacePointCloud(
  robot: URDFRobot,
  samples: number,
  signal?: AbortSignal,
  onProgress?: (progress: WorkspaceProgress) => void,
) {
  const toolPoint = findToolPoint(robot);
  if (!toolPoint) {
    throw new Error('No tool_point or end-effector link found.');
  }

  const movableJoints = collectMovableJoints(robot);
  if (!movableJoints.length) {
    throw new Error('No movable joints found.');
  }

  const poseAtStart = snapshotJointPose(movableJoints);
  const points: THREE.Vector3[] = [];
  const pos = new THREE.Vector3();
  const sampleChunk = 2500;

  try {
    for (let i = 0; i < samples; i += 1) {
      throwIfAborted(signal);

      for (const joint of movableJoints) {
        joint.obj.setJointValue(joint.min + Math.random() * joint.range);
      }

      robot.updateMatrixWorld(true);
      toolPoint.getWorldPosition(pos);
      points.push(pos.clone());

      if ((i + 1) % sampleChunk === 0) {
        applyJointPose(movableJoints, poseAtStart);
        robot.updateMatrixWorld(true);
        onProgress?.({
          percent: Math.round(((i + 1) / samples) * 60),
          label: 'Sampling workspace',
        });
        await nextFrame();
      }
    }
  } finally {
    applyJointPose(movableJoints, poseAtStart);
    robot.updateMatrixWorld(true);
  }

  return points;
}

function computeBBox(points: THREE.Vector3[]) {
  let minx = Infinity;
  let miny = Infinity;
  let minz = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  let maxz = -Infinity;

  for (const point of points) {
    minx = Math.min(minx, point.x);
    miny = Math.min(miny, point.y);
    minz = Math.min(minz, point.z);
    maxx = Math.max(maxx, point.x);
    maxy = Math.max(maxy, point.y);
    maxz = Math.max(maxz, point.z);
  }

  return { minx, miny, minz, maxx, maxy, maxz };
}

function makeSeqId() {
  return (Math.random() * 0xffffffff) >>> 0;
}

async function sendPointCloud(
  ws: WebSocket,
  points: THREE.Vector3[],
  seqId: number,
  signal?: AbortSignal,
  onProgress?: (progress: WorkspaceProgress) => void,
) {
  throwIfAborted(signal);
  const chunkPoints = 200_000;
  const totalPoints = points.length >>> 0;
  const { minx, miny, minz, maxx, maxy, maxz } = computeBBox(points);
  const dx = maxx - minx || 1e-9;
  const dy = maxy - miny || 1e-9;
  const dz = maxz - minz || 1e-9;
  const scalex = dx / 65535.0;
  const scaley = dy / 65535.0;
  const scalez = dz / 65535.0;
  const chunkCount = Math.ceil(totalPoints / chunkPoints) >>> 0;

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    throwIfAborted(signal);

    const startIndex = chunkIndex * chunkPoints;
    const end = Math.min(startIndex + chunkPoints, totalPoints);
    const n = (end - startIndex) >>> 0;
    const buf = new ArrayBuffer(PCD_HEADER_BYTES + n * 3 * 2);
    const dv = new DataView(buf);

    dv.setUint8(0, 0x50);
    dv.setUint8(1, 0x43);
    dv.setUint8(2, 0x44);
    dv.setUint8(3, 0x32);
    dv.setUint32(4, seqId, true);
    dv.setUint32(8, chunkIndex >>> 0, true);
    dv.setUint32(12, chunkCount, true);
    dv.setUint32(16, totalPoints, true);
    dv.setUint32(20, startIndex >>> 0, true);
    dv.setUint32(24, n, true);
    dv.setFloat32(28, minx, true);
    dv.setFloat32(32, miny, true);
    dv.setFloat32(36, minz, true);
    dv.setFloat32(40, scalex, true);
    dv.setFloat32(44, scaley, true);
    dv.setFloat32(48, scalez, true);

    let off = PCD_HEADER_BYTES;
    for (let i = startIndex; i < end; i += 1) {
      const point = points[i]!;
      dv.setUint16(off, Math.max(0, Math.min(65535, Math.round((point.x - minx) / scalex))), true);
      dv.setUint16(
        off + 2,
        Math.max(0, Math.min(65535, Math.round((point.y - miny) / scaley))),
        true,
      );
      dv.setUint16(
        off + 4,
        Math.max(0, Math.min(65535, Math.round((point.z - minz) / scalez))),
        true,
      );
      off += 6;
    }

    ws.send(buf);
    onProgress?.({
      percent: 60 + Math.round(((chunkIndex + 1) / chunkCount) * 30),
      label: 'Uploading workspace',
    });
    await nextFrame();
  }
}

function decodePcdChunk(buf: ArrayBuffer, assemblies: Map<number, PcdAssembly>) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'PCD2') return null;

  const seqId = dv.getUint32(4, true);
  const chunkCount = dv.getUint32(12, true);
  const totalPoints = dv.getUint32(16, true);
  const startIndex = dv.getUint32(20, true);
  const min: [number, number, number] = [
    dv.getFloat32(28, true),
    dv.getFloat32(32, true),
    dv.getFloat32(36, true),
  ];
  const scale: [number, number, number] = [
    dv.getFloat32(40, true),
    dv.getFloat32(44, true),
    dv.getFloat32(48, true),
  ];

  let asm = assemblies.get(seqId);
  if (!asm) {
    asm = {
      totalPoints,
      chunkCount,
      got: 0,
      min,
      scale,
      qbuf: new Uint16Array(totalPoints * 3),
    };
    assemblies.set(seqId, asm);
  }

  const data = new Uint16Array(buf, PCD_HEADER_BYTES);
  asm.qbuf.set(data, startIndex * 3);
  asm.got += 1;

  if (asm.got < asm.chunkCount) return null;

  const points = new Array<THREE.Vector3>(asm.totalPoints);
  for (let i = 0; i < asm.totalPoints; i += 1) {
    points[i] = new THREE.Vector3(
      asm.min[0] + (asm.qbuf[i * 3] ?? 0) * asm.scale[0],
      asm.min[1] + (asm.qbuf[i * 3 + 1] ?? 0) * asm.scale[1],
      asm.min[2] + (asm.qbuf[i * 3 + 2] ?? 0) * asm.scale[2],
    );
  }

  assemblies.delete(seqId);
  return points;
}

function openWorkspaceSocket(signal?: AbortSignal) {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(WORKSPACE_WS_URL);
    ws.binaryType = 'arraybuffer';

    const cleanup = () => {
      ws.removeEventListener('open', handleOpen);
      ws.removeEventListener('error', handleError);
      signal?.removeEventListener('abort', handleAbort);
    };
    const handleOpen = () => {
      cleanup();
      resolve(ws);
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Workspace WebSocket connection failed.'));
    };
    const handleAbort = () => {
      cleanup();
      ws.close();
      reject(createAbortError());
    };

    ws.addEventListener('open', handleOpen);
    ws.addEventListener('error', handleError);
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export async function generateWorkspacePointCloud({
  robot,
  resolution,
  signal,
  onProgress,
}: WorkspaceGenerateOptions) {
  const cfg = WORKSPACE_RESOLUTIONS[resolution];
  const seqId = makeSeqId();
  const assemblies = new Map<number, PcdAssembly>();
  let ws: WebSocket | null = null;

  try {
    onProgress?.({ percent: 0, label: 'Connecting workspace backend' });
    ws = await openWorkspaceSocket(signal);
    ws.send(`pcd_cfg|voxel_size=${cfg.voxelSize}`);

    const resultPromise = new Promise<THREE.Vector3[]>((resolve, reject) => {
      const cleanup = () => {
        ws!.removeEventListener('message', handleMessage);
        ws!.removeEventListener('close', handleClose);
        ws!.removeEventListener('error', handleError);
        signal?.removeEventListener('abort', handleAbort);
      };
      const finish = (points: THREE.Vector3[]) => {
        cleanup();
        resolve(points);
      };
      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };
      const handleAbort = () => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(`pcd_abort|seq=${seqId}`);
        }
        fail(createAbortError());
      };
      const handleClose = () => fail(new Error('Workspace WebSocket closed.'));
      const handleError = () => fail(new Error('Workspace WebSocket failed.'));
      const handleMessage = async (event: MessageEvent) => {
        try {
          if (typeof event.data === 'string') {
            if (event.data.includes('processing_error')) {
              fail(new Error(event.data));
            }
            if (event.data.includes('processing_done')) {
              onProgress?.({ percent: 95, label: 'Receiving workspace surface' });
            }
            return;
          }

          const buffer =
            event.data instanceof ArrayBuffer ? event.data : await event.data.arrayBuffer();
          const points = decodePcdChunk(buffer, assemblies);
          if (points) {
            finish(points);
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      ws!.addEventListener('message', handleMessage);
      ws!.addEventListener('close', handleClose);
      ws!.addEventListener('error', handleError);
      signal?.addEventListener('abort', handleAbort, { once: true });
    });

    const sampledPoints = await sampleWorkspacePointCloud(robot, cfg.samples, signal, onProgress);
    ws.send(`pcd_cfg|voxel_size=${cfg.voxelSize}`);
    await sendPointCloud(ws, sampledPoints, seqId, signal, onProgress);
    onProgress?.({ percent: 90, label: 'Processing workspace surface' });

    const surfacePoints = await resultPromise;
    onProgress?.({ percent: 100, label: 'Workspace ready' });
    return surfacePoints;
  } catch (error) {
    if (signal?.aborted && ws?.readyState === WebSocket.OPEN) {
      ws.send(`pcd_abort|seq=${seqId}`);
    }
    throw error;
  } finally {
    ws?.close();
  }
}
