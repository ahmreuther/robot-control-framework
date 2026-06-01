import * as THREE from "three";
import type { URDFRobot } from "urdf-loader/src/URDFClasses";

import type {
  SurfaceProcessingConfig,
  SurfaceClientMessage,
  SurfaceServerMessage,
} from "../../../shared/api/surfaceMessages";
import { emitSurfaceMessageLog } from "../../../shared/api/surfaceMessageLog";

export type WorkspaceResolution = "low" | "medium" | "high";

export interface WorkspaceProgress {
  percent: number;
  label: string;
}

export interface GenerateWorkspaceSurfaceOptions {
  robot: URDFRobot;
  localRoot: THREE.Object3D;
  resolution?: WorkspaceResolution;
  sampleCount?: number;
  signal?: AbortSignal;
  onProgress?: (progress: WorkspaceProgress) => void;
}

interface MovableJoint {
  obj: {
    name: string;
    angle?: number;
    jointType?: string;
    limit?: { lower?: number; upper?: number };
    setJointValue(value: number): void;
  };
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

const WORKSPACE_RESOLUTIONS: Record<
  WorkspaceResolution,
  { samples: number; voxelSize: number }
> = {
  low: { samples: 1_000_000, voxelSize: 0.02 },
  medium: { samples: 4_000_000, voxelSize: 0.015 },
  high: { samples: 8_000_000, voxelSize: 0.01 },
};

const DEFAULT_SURFACE_WS_URL = "ws://127.0.0.1:8000/ws/surface";
const PCD_HEADER_BYTES = 52;
const MIN_WORKSPACE_SAMPLE_COUNT = 1000;
const MAX_WORKSPACE_SAMPLE_COUNT = 8_000_000;

function clampWorkspaceSampleCount(sampleCount: number) {
  if (!Number.isFinite(sampleCount)) {
    return WORKSPACE_RESOLUTIONS.low.samples;
  }
  return Math.max(
    MIN_WORKSPACE_SAMPLE_COUNT,
    Math.min(MAX_WORKSPACE_SAMPLE_COUNT, Math.round(sampleCount)),
  );
}

function createSurfaceProcessingConfig(
  sampleCount: number,
  fallbackVoxelSize: number,
): SurfaceProcessingConfig {
  if (sampleCount <= 100_000) {
    return {
      voxelSize: 0.03,
      sigma: 0.05,
      isoLevel: 0.2,
      padding: 0.05,
      closingRadius: 1,
      minPoints: 200,
      mapMode: "radius",
      mapRadius: 0.04,
    };
  }

  if (sampleCount <= 250_000) {
    return {
      voxelSize: 0.025,
      sigma: 0.04,
      isoLevel: 0.24,
      padding: 0.05,
      closingRadius: 1,
      minPoints: 200,
      mapMode: "radius",
      mapRadius: 0.032,
    };
  }

  if (sampleCount <= 750_000) {
    return {
      voxelSize: 0.02,
      sigma: 0.03,
      isoLevel: 0.28,
      padding: 0.05,
      closingRadius: 1,
      minPoints: 200,
      mapMode: "radius",
      mapRadius: 0.025,
    };
  }

  return {
    voxelSize: fallbackVoxelSize,
    sigma: 0.02,
    isoLevel: 0.3,
    padding: 0.05,
    closingRadius: 0,
    minPoints: 200,
    mapMode: "nn",
    mapRadius: null,
  };
}

function getSurfaceWebSocketUrl() {
  const base = import.meta.env.VITE_WSC2_WS_URL ?? "ws://127.0.0.1:8000/ws";
  return base.replace(/\/ws\/?$/, "/ws/surface") || DEFAULT_SURFACE_WS_URL;
}

function createAbortError(message = "Workspace generation aborted") {
  const error = new Error(message);
  error.name = "AbortError";
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

function nextRequestId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function describeSurfaceClientMessage(message: SurfaceClientMessage): string {
  switch (message.type) {
    case "beginSurfaceUpload":
      return `surface sent beginSurfaceUpload -> voxel=${message.config?.voxelSize ?? "default"}`;
    case "finishSurfaceUpload":
      return `surface sent finishSurfaceUpload -> ${message.jobId}`;
    case "abortSurfaceJob":
      return `surface sent abortSurfaceJob -> ${message.jobId}`;
    default:
      return `surface sent ${JSON.stringify(message)}`;
  }
}

function describeSurfaceServerMessage(message: SurfaceServerMessage): string {
  switch (message.type) {
    case "surfaceUploadStarted":
      return `surface received surfaceUploadStarted <- ${message.jobId}`;
    case "surfaceUploadProgress":
      return `surface received surfaceUploadProgress <- ${message.jobId} ${message.chunksReceived}/${message.chunkCount}`;
    case "surfaceUploadCompleted":
      return `surface received surfaceUploadCompleted <- ${message.jobId} points=${message.pointCount}`;
    case "surfaceProcessingProgress":
      return `surface received surfaceProcessingProgress <- ${message.jobId} ${message.stage}${message.message ? ` (${message.message})` : ""}`;
    case "surfaceJobReady":
      return `surface received surfaceJobReady <- ${message.jobId} result=${message.resultPointCount}`;
    case "surfaceResultStreamCompleted":
      return `surface received surfaceResultStreamCompleted <- ${message.jobId} points=${message.pointCount}`;
    case "surfaceJobAborted":
      return `surface received surfaceJobAborted <- ${message.jobId}`;
    case "surfaceJobError":
      return `surface received surfaceJobError <- ${message.jobId ?? "unknown"} ${message.message}`;
    default:
      return `surface received ${JSON.stringify(message)}`;
  }
}

function findToolPoint(robot: URDFRobot): THREE.Object3D | null {
  let toolPoint: THREE.Object3D | null = null;
  robot.traverse((child) => {
    if (child.name === "tool_point") {
      toolPoint = child;
    }
  });
  if (!toolPoint) {
    robot.traverse((child) => {
      if (child.type === "URDFLink" && child.children.length === 0) {
        toolPoint = child;
      }
    });
  }
  return toolPoint;
}

function collectMovableJoints(robot: URDFRobot): MovableJoint[] {
  const movable: MovableJoint[] = [];
  robot.traverse((child) => {
    const candidate = child as unknown as MovableJoint["obj"] & {
      isURDFJoint?: boolean;
    };
    if (!candidate.isURDFJoint || candidate.jointType === "fixed") {
      return;
    }

    const lower =
      candidate.limit && Number.isFinite(candidate.limit.lower)
        ? (candidate.limit.lower as number)
        : candidate.jointType === "prismatic"
          ? 0
          : -Math.PI;
    const upper =
      candidate.limit && Number.isFinite(candidate.limit.upper)
        ? (candidate.limit.upper as number)
        : candidate.jointType === "prismatic"
          ? 1
          : Math.PI;

    movable.push({
      obj: candidate,
      min: lower,
      range: upper - lower || 1,
    });
  });
  return movable;
}

function snapshotJointPose(movableJoints: MovableJoint[]) {
  const snapshot = new Map<string, number>();
  for (const joint of movableJoints) {
    snapshot.set(joint.obj.name, joint.obj.angle ?? 0);
  }
  return snapshot;
}

function applyJointPose(
  movableJoints: MovableJoint[],
  snapshot: Map<string, number>,
) {
  for (const joint of movableJoints) {
    const angle = snapshot.get(joint.obj.name);
    if (angle !== undefined) {
      joint.obj.setJointValue(angle);
    }
  }
}

async function sampleWorkspacePointCloud(
  robot: URDFRobot,
  localRoot: THREE.Object3D,
  samples: number,
  signal?: AbortSignal,
  onProgress?: (progress: WorkspaceProgress) => void,
) {
  const toolPoint = findToolPoint(robot);
  if (!toolPoint) {
    throw new Error("No tool_point or end-effector link found.");
  }
  const resolvedToolPoint: THREE.Object3D = toolPoint;

  const movableJoints = collectMovableJoints(robot);
  if (!movableJoints.length) {
    throw new Error("No movable joints found.");
  }

  const poseAtStart = snapshotJointPose(movableJoints);
  const points: THREE.Vector3[] = [];
  const worldPos = new THREE.Vector3();
  const sampleChunk = 2500;

  try {
    for (let index = 0; index < samples; index += 1) {
      throwIfAborted(signal);

      for (const joint of movableJoints) {
        joint.obj.setJointValue(joint.min + Math.random() * joint.range);
      }

      robot.updateMatrixWorld(true);
      localRoot.updateMatrixWorld(true);
      resolvedToolPoint.getWorldPosition(worldPos);
      points.push(localRoot.worldToLocal(worldPos.clone()));

      if ((index + 1) % sampleChunk === 0) {
        applyJointPose(movableJoints, poseAtStart);
        robot.updateMatrixWorld(true);
        localRoot.updateMatrixWorld(true);
        onProgress?.({
          percent: Math.round(((index + 1) / samples) * 60),
          label: "Sampling workspace",
        });
        await nextFrame();
      }
    }
  } finally {
    applyJointPose(movableJoints, poseAtStart);
    robot.updateMatrixWorld(true);
    localRoot.updateMatrixWorld(true);
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

function encodePcd2Chunk(
  points: THREE.Vector3[],
  {
    seqId,
    chunkIndex,
    chunkCount,
    totalPoints,
    startIndex,
    minx,
    miny,
    minz,
    scalex,
    scaley,
    scalez,
  }: {
    seqId: number;
    chunkIndex: number;
    chunkCount: number;
    totalPoints: number;
    startIndex: number;
    minx: number;
    miny: number;
    minz: number;
    scalex: number;
    scaley: number;
    scalez: number;
  },
) {
  const end = Math.min(startIndex + 200_000, totalPoints);
  const pointCount = end - startIndex;
  const buf = new ArrayBuffer(PCD_HEADER_BYTES + pointCount * 3 * 2);
  const dv = new DataView(buf);

  dv.setUint8(0, 0x50);
  dv.setUint8(1, 0x43);
  dv.setUint8(2, 0x44);
  dv.setUint8(3, 0x32);
  dv.setUint32(4, seqId, true);
  dv.setUint32(8, chunkIndex >>> 0, true);
  dv.setUint32(12, chunkCount >>> 0, true);
  dv.setUint32(16, totalPoints >>> 0, true);
  dv.setUint32(20, startIndex >>> 0, true);
  dv.setUint32(24, pointCount >>> 0, true);
  dv.setFloat32(28, minx, true);
  dv.setFloat32(32, miny, true);
  dv.setFloat32(36, minz, true);
  dv.setFloat32(40, scalex, true);
  dv.setFloat32(44, scaley, true);
  dv.setFloat32(48, scalez, true);

  let offset = PCD_HEADER_BYTES;
  for (let index = startIndex; index < end; index += 1) {
    const point = points[index]!;
    dv.setUint16(
      offset,
      Math.max(0, Math.min(65535, Math.round((point.x - minx) / scalex))),
      true,
    );
    dv.setUint16(
      offset + 2,
      Math.max(0, Math.min(65535, Math.round((point.y - miny) / scaley))),
      true,
    );
    dv.setUint16(
      offset + 4,
      Math.max(0, Math.min(65535, Math.round((point.z - minz) / scalez))),
      true,
    );
    offset += 6;
  }

  return buf;
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
    ws.send(
      encodePcd2Chunk(points, {
        seqId,
        chunkIndex,
        chunkCount,
        totalPoints,
        startIndex,
        minx,
        miny,
        minz,
        scalex,
        scaley,
        scalez,
      }),
    );
    onProgress?.({
      percent: 60 + Math.round(((chunkIndex + 1) / chunkCount) * 30),
      label: "Uploading workspace",
    });
    await nextFrame();
  }
}

function decodePcdChunk(buf: ArrayBuffer, assemblies: Map<number, PcdAssembly>) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(
    dv.getUint8(0),
    dv.getUint8(1),
    dv.getUint8(2),
    dv.getUint8(3),
  );
  if (magic !== "PCD2") return null;

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

  let assembly = assemblies.get(seqId);
  if (!assembly) {
    assembly = {
      totalPoints,
      chunkCount,
      got: 0,
      min,
      scale,
      qbuf: new Uint16Array(totalPoints * 3),
    };
    assemblies.set(seqId, assembly);
  }

  const data = new Uint16Array(buf, PCD_HEADER_BYTES);
  assembly.qbuf.set(data, startIndex * 3);
  assembly.got += 1;

  if (assembly.got < assembly.chunkCount) {
    return null;
  }

  const points = new Array<THREE.Vector3>(assembly.totalPoints);
  for (let index = 0; index < assembly.totalPoints; index += 1) {
    points[index] = new THREE.Vector3(
      assembly.min[0] + (assembly.qbuf[index * 3] ?? 0) * assembly.scale[0],
      assembly.min[1] + (assembly.qbuf[index * 3 + 1] ?? 0) * assembly.scale[1],
      assembly.min[2] + (assembly.qbuf[index * 3 + 2] ?? 0) * assembly.scale[2],
    );
  }

  assemblies.delete(seqId);
  return points;
}

function openSurfaceSocket(signal?: AbortSignal) {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(getSurfaceWebSocketUrl());
    ws.binaryType = "arraybuffer";

    const cleanup = () => {
      ws.removeEventListener("open", handleOpen);
      ws.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };

    const handleOpen = () => {
      cleanup();
      resolve(ws);
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Surface WebSocket connection failed."));
    };

    const handleAbort = () => {
      cleanup();
      ws.close();
      reject(createAbortError());
    };

    ws.addEventListener("open", handleOpen);
    ws.addEventListener("error", handleError);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function parseServerMessage(raw: string): SurfaceServerMessage {
  const message = JSON.parse(raw) as SurfaceServerMessage;
  emitSurfaceMessageLog(describeSurfaceServerMessage(message));
  return message;
}

function sendMessage(ws: WebSocket, message: SurfaceClientMessage) {
  emitSurfaceMessageLog(describeSurfaceClientMessage(message));
  ws.send(JSON.stringify(message));
}

export async function generateWorkspaceSurface({
  robot,
  localRoot,
  resolution = "medium",
  sampleCount,
  signal,
  onProgress,
}: GenerateWorkspaceSurfaceOptions) {
  const cfg = WORKSPACE_RESOLUTIONS[resolution];
  const resolvedSampleCount = clampWorkspaceSampleCount(
    sampleCount ?? cfg.samples,
  );
  const surfaceConfig = createSurfaceProcessingConfig(
    resolvedSampleCount,
    cfg.voxelSize,
  );
  const seqId = Math.floor(Math.random() * 0xffffffff) >>> 0;
  const assemblies = new Map<number, PcdAssembly>();
  let ws: WebSocket | null = null;
  let jobId: string | null = null;

  try {
    onProgress?.({ percent: 0, label: "Connecting surface backend" });
    emitSurfaceMessageLog(`surface opening websocket -> ${getSurfaceWebSocketUrl()}`);
    ws = await openSurfaceSocket(signal);
    emitSurfaceMessageLog("surface connected");

    const startedPromise = new Promise<string>((resolve, reject) => {
      const handleMessage = (event: MessageEvent) => {
          if (typeof event.data !== "string") {
            return;
          }
        const message = parseServerMessage(event.data);
        if (message.type === "surfaceUploadStarted") {
          cleanup();
          resolve(message.jobId);
          return;
        }
        if (message.type === "surfaceJobError") {
          cleanup();
          reject(new Error(message.message));
        }
      };
      const handleClose = () => {
        emitSurfaceMessageLog("surface socket closed before upload started");
        cleanup();
        reject(new Error("Surface WebSocket closed before upload started."));
      };
      const handleError = () => {
        emitSurfaceMessageLog("surface socket error before upload started");
        cleanup();
        reject(new Error("Surface WebSocket failed before upload started."));
      };
      const cleanup = () => {
        ws!.removeEventListener("message", handleMessage);
        ws!.removeEventListener("close", handleClose);
        ws!.removeEventListener("error", handleError);
      };
      ws!.addEventListener("message", handleMessage);
      ws!.addEventListener("close", handleClose);
      ws!.addEventListener("error", handleError);
    });

    sendMessage(ws, {
      type: "beginSurfaceUpload",
      requestId: nextRequestId("surface-begin"),
      config: surfaceConfig,
    });
    jobId = await startedPromise;

    const resultPromise = new Promise<THREE.Vector3[]>((resolve, reject) => {
      let expectedSeqId: number | null = null;
      let decodedPoints: THREE.Vector3[] | null = null;

      const cleanup = () => {
        ws!.removeEventListener("message", handleMessage);
        ws!.removeEventListener("close", handleClose);
        ws!.removeEventListener("error", handleError);
        signal?.removeEventListener("abort", handleAbort);
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
        if (ws?.readyState === WebSocket.OPEN && jobId) {
          sendMessage(ws, {
            type: "abortSurfaceJob",
            requestId: nextRequestId("surface-abort"),
            jobId,
          });
        }
        emitSurfaceMessageLog(`surface abort requested -> ${jobId ?? "unknown"}`);
        fail(createAbortError());
      };

      const handleClose = () => {
        emitSurfaceMessageLog("surface socket closed");
        fail(new Error("Surface WebSocket closed."));
      };
      const handleError = () => {
        emitSurfaceMessageLog("surface socket error");
        fail(new Error("Surface WebSocket failed."));
      };

      const handleMessage = async (event: MessageEvent) => {
        try {
          if (typeof event.data === "string") {
            const message = parseServerMessage(event.data);
            switch (message.type) {
              case "surfaceUploadProgress":
                onProgress?.({
                  percent:
                    60 +
                    Math.round(
                      (message.chunksReceived / Math.max(1, message.chunkCount)) *
                        20,
                    ),
                  label: "Uploading workspace",
                });
                return;
              case "surfaceUploadCompleted":
                return;
              case "surfaceProcessingProgress":
                onProgress?.({
                  percent: 90,
                  label: `Processing workspace surface${
                    message.message ? ` (${message.message})` : ""
                  }`,
                });
                return;
              case "surfaceJobReady":
                expectedSeqId = message.streamSeqId;
                onProgress?.({
                  percent: 95,
                  label: "Receiving workspace surface",
                });
                return;
              case "surfaceResultStreamCompleted":
                if (expectedSeqId === message.streamSeqId && decodedPoints) {
                  onProgress?.({ percent: 100, label: "Workspace ready" });
                  finish(decodedPoints);
                }
                return;
              case "surfaceJobAborted":
                fail(createAbortError());
                return;
              case "surfaceJobError":
                fail(new Error(message.message));
                return;
              default:
                return;
            }
          }

          const buffer =
            event.data instanceof ArrayBuffer
              ? event.data
              : await event.data.arrayBuffer();
          const points = decodePcdChunk(buffer, assemblies);
          if (points) {
            emitSurfaceMessageLog(
              `surface received binary result <- points=${points.length}`,
            );
            decodedPoints = points;
          } else {
            emitSurfaceMessageLog("surface received binary result chunk");
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      ws!.addEventListener("message", handleMessage);
      ws!.addEventListener("close", handleClose);
      ws!.addEventListener("error", handleError);
      signal?.addEventListener("abort", handleAbort, { once: true });
    });

    const sampledPoints = await sampleWorkspacePointCloud(
      robot,
      localRoot,
      resolvedSampleCount,
      signal,
      onProgress,
    );
    emitSurfaceMessageLog(`surface sampled local cloud -> points=${sampledPoints.length}`);
    await sendPointCloud(ws, sampledPoints, seqId, signal, onProgress);
    sendMessage(ws, {
      type: "finishSurfaceUpload",
      requestId: nextRequestId("surface-finish"),
      jobId,
    });

    return await resultPromise;
  } catch (error) {
    if (
      signal?.aborted &&
      ws?.readyState === WebSocket.OPEN &&
      jobId
    ) {
      sendMessage(ws, {
        type: "abortSurfaceJob",
        requestId: nextRequestId("surface-abort"),
        jobId,
      });
    }
    emitSurfaceMessageLog(
      `surface failed -> ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  } finally {
    emitSurfaceMessageLog("surface websocket closing");
    ws?.close();
  }
}
