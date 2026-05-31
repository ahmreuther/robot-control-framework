from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, TypeAdapter

from .base import ContractModel


class SurfaceProcessingConfig(ContractModel):
    voxel_size: float = 0.01
    sigma: float = 0.02
    iso_level: float = 0.30
    padding: float = 0.05
    closing_radius: int = 0
    min_points: int = 200
    map_mode: Literal["nn", "radius"] = "nn"
    map_radius: float | None = None


class BeginSurfaceUploadCommand(ContractModel):
    type: Literal["beginSurfaceUpload"]
    request_id: str
    config: SurfaceProcessingConfig = Field(default_factory=SurfaceProcessingConfig)


class FinishSurfaceUploadCommand(ContractModel):
    type: Literal["finishSurfaceUpload"]
    request_id: str
    job_id: str


class AbortSurfaceJobCommand(ContractModel):
    type: Literal["abortSurfaceJob"]
    request_id: str
    job_id: str


SurfaceClientMessage = Annotated[
    BeginSurfaceUploadCommand | FinishSurfaceUploadCommand | AbortSurfaceJobCommand,
    Field(discriminator="type"),
]


class SurfaceUploadStartedEvent(ContractModel):
    type: Literal["surfaceUploadStarted"]
    request_id: str | None = None
    job_id: str
    config: SurfaceProcessingConfig


class SurfaceUploadProgressEvent(ContractModel):
    type: Literal["surfaceUploadProgress"]
    job_id: str
    chunks_received: int
    chunk_count: int
    point_count: int


class SurfaceUploadCompletedEvent(ContractModel):
    type: Literal["surfaceUploadCompleted"]
    job_id: str
    point_count: int
    chunk_count: int


class SurfaceProcessingProgressEvent(ContractModel):
    type: Literal["surfaceProcessingProgress"]
    job_id: str
    stage: str
    message: str | None = None


class SurfaceJobReadyEvent(ContractModel):
    type: Literal["surfaceJobReady"]
    request_id: str | None = None
    job_id: str
    original_point_count: int
    result_point_count: int
    result_format: Literal["pcd2"] = "pcd2"
    stream_seq_id: int


class SurfaceResultStreamCompletedEvent(ContractModel):
    type: Literal["surfaceResultStreamCompleted"]
    job_id: str
    point_count: int
    chunk_count: int
    stream_seq_id: int


class SurfaceJobAbortedEvent(ContractModel):
    type: Literal["surfaceJobAborted"]
    request_id: str | None = None
    job_id: str


class SurfaceJobErrorEvent(ContractModel):
    type: Literal["surfaceJobError"]
    request_id: str | None = None
    job_id: str | None = None
    message: str
    code: str | None = None


SurfaceServerMessage = Annotated[
    SurfaceUploadStartedEvent
    | SurfaceUploadProgressEvent
    | SurfaceUploadCompletedEvent
    | SurfaceProcessingProgressEvent
    | SurfaceJobReadyEvent
    | SurfaceResultStreamCompletedEvent
    | SurfaceJobAbortedEvent
    | SurfaceJobErrorEvent,
    Field(discriminator="type"),
]

_surface_client_message_adapter = TypeAdapter(SurfaceClientMessage)
_surface_server_message_adapter = TypeAdapter(SurfaceServerMessage)


def parse_surface_client_message_json(raw: str) -> SurfaceClientMessage:
    return _surface_client_message_adapter.validate_json(raw)


def parse_surface_server_message_json(raw: str) -> SurfaceServerMessage:
    return _surface_server_message_adapter.validate_json(raw)
