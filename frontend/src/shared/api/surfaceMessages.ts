export interface SurfaceProcessingConfig {
  voxelSize?: number;
  sigma?: number;
  isoLevel?: number;
  padding?: number;
  closingRadius?: number;
  minPoints?: number;
  mapMode?: "nn" | "radius";
  mapRadius?: number | null;
}

export type SurfaceClientMessage =
  | {
      type: "beginSurfaceUpload";
      requestId: string;
      config?: SurfaceProcessingConfig;
    }
  | {
      type: "finishSurfaceUpload";
      requestId: string;
      jobId: string;
    }
  | {
      type: "abortSurfaceJob";
      requestId: string;
      jobId: string;
    };

export type SurfaceServerMessage =
  | {
      type: "surfaceUploadStarted";
      requestId?: string | null;
      jobId: string;
      config: Required<SurfaceProcessingConfig>;
    }
  | {
      type: "surfaceUploadProgress";
      jobId: string;
      chunksReceived: number;
      chunkCount: number;
      pointCount: number;
    }
  | {
      type: "surfaceUploadCompleted";
      jobId: string;
      pointCount: number;
      chunkCount: number;
    }
  | {
      type: "surfaceProcessingProgress";
      jobId: string;
      stage: string;
      message?: string | null;
    }
  | {
      type: "surfaceJobReady";
      requestId?: string | null;
      jobId: string;
      originalPointCount: number;
      resultPointCount: number;
      resultFormat: "pcd2";
      streamSeqId: number;
    }
  | {
      type: "surfaceResultStreamCompleted";
      jobId: string;
      pointCount: number;
      chunkCount: number;
      streamSeqId: number;
    }
  | {
      type: "surfaceJobAborted";
      requestId?: string | null;
      jobId: string;
    }
  | {
      type: "surfaceJobError";
      requestId?: string | null;
      jobId?: string | null;
      message: string;
      code?: string | null;
    };
