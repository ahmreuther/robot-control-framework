from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Literal

from wsc2_backend.geometry.pointcloud_transport import PcdAssembly
from wsc2_backend.models.surface import SurfaceProcessingConfig


SurfaceJobStatus = Literal[
    "uploading",
    "uploaded",
    "processing",
    "completed",
    "aborted",
    "error",
]


@dataclass(slots=True)
class SurfaceJob:
    job_id: str
    stream_seq_id: int
    owner_id: str | None
    config: SurfaceProcessingConfig
    status: SurfaceJobStatus = "uploading"
    assembly: PcdAssembly | None = None
    raw_points: object | None = None
    surface_points: object | None = None
    original_point_count: int = 0
    result_point_count: int = 0
    abort_requested: bool = False
    abort_notified: bool = False
    processing_task: asyncio.Task[None] | None = None
