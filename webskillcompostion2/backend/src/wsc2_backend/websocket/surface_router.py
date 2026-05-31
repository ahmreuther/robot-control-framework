from __future__ import annotations

import asyncio
from uuid import uuid4

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from wsc2_backend.geometry.pointcloud_transport import (
    PcdAssembly,
    decode_pcd2_chunk,
    iter_encoded_pcd2_chunks,
)
from wsc2_backend.geometry.surface_reconstruction import compute_surface_points_from_xyz
from wsc2_backend.models.surface import (
    AbortSurfaceJobCommand,
    BeginSurfaceUploadCommand,
    FinishSurfaceUploadCommand,
    SurfaceClientMessage,
    SurfaceJobAbortedEvent,
    SurfaceJobErrorEvent,
    SurfaceJobReadyEvent,
    SurfaceProcessingProgressEvent,
    SurfaceResultStreamCompletedEvent,
    SurfaceUploadCompletedEvent,
    SurfaceUploadProgressEvent,
    SurfaceUploadStartedEvent,
    parse_surface_client_message_json,
)
from wsc2_backend.runtime.surface_job import SurfaceJob
from wsc2_backend.services.runtime_registry import RuntimeRegistry


def get_registry(websocket: WebSocket) -> RuntimeRegistry:
    registry = getattr(websocket.app.state, "registry", None)
    if not isinstance(registry, RuntimeRegistry):
        registry = RuntimeRegistry()
        websocket.app.state.registry = registry
    return registry


async def send_event(websocket: WebSocket, event) -> None:
    await websocket.send_text(event.model_dump_json(by_alias=True))

async def _emit_surface_error(
    websocket: WebSocket,
    *,
    request_id: str | None = None,
    job_id: str | None = None,
    message: str,
    code: str | None = None,
) -> None:
    await send_event(
        websocket,
        SurfaceJobErrorEvent(
            type="surfaceJobError",
            request_id=request_id,
            job_id=job_id,
            message=message,
            code=code,
        ),
    )


async def _emit_aborted_if_needed(websocket: WebSocket, job: SurfaceJob, request_id: str | None = None) -> None:
    if job.abort_notified:
        return
    job.abort_notified = True
    job.status = "aborted"
    await send_event(
        websocket,
        SurfaceJobAbortedEvent(
            type="surfaceJobAborted",
            request_id=request_id,
            job_id=job.job_id,
        ),
    )


async def _process_surface_job(
    websocket: WebSocket,
    registry: RuntimeRegistry,
    job: SurfaceJob,
    request_id: str,
    send_lock: asyncio.Lock,
) -> None:
    try:
        async def emit_progress(stage: str, message: str | None = None) -> None:
            async with send_lock:
                await send_event(
                    websocket,
                    SurfaceProcessingProgressEvent(
                        type="surfaceProcessingProgress",
                        job_id=job.job_id,
                        stage=stage,
                        message=message,
                    ),
                )

        def status_cb(stage: str, message: str | None = None) -> None:
            asyncio.run_coroutine_threadsafe(emit_progress(stage, message), loop)

        loop = asyncio.get_running_loop()
        await emit_progress("processing_start")

        result = await asyncio.to_thread(
            compute_surface_points_from_xyz,
            job.raw_points,
            voxel_size=job.config.voxel_size,
            sigma=job.config.sigma,
            iso_level=job.config.iso_level,
            padding=job.config.padding,
            closing_radius=job.config.closing_radius,
            min_points=job.config.min_points,
            map_mode=job.config.map_mode,
            map_radius=job.config.map_radius,
            status_cb=status_cb,
        )

        if job.abort_requested:
            async with send_lock:
                await _emit_aborted_if_needed(websocket, job)
            registry.remove_surface_job(job.job_id)
            return

        job.surface_points = result
        job.status = "completed"
        job.result_point_count = int(result.shape[0])

        chunks = list(
            iter_encoded_pcd2_chunks(
                result,
                chunk_points=200000,
                seq_id=job.stream_seq_id,
            )
        )

        async with send_lock:
            await send_event(
                websocket,
                SurfaceJobReadyEvent(
                    type="surfaceJobReady",
                    request_id=request_id,
                    job_id=job.job_id,
                    original_point_count=job.original_point_count,
                    result_point_count=job.result_point_count,
                    stream_seq_id=job.stream_seq_id,
                ),
            )
            for encoded_chunk, _chunk in chunks:
                await websocket.send_bytes(encoded_chunk)
            await send_event(
                websocket,
                SurfaceResultStreamCompletedEvent(
                    type="surfaceResultStreamCompleted",
                    job_id=job.job_id,
                    point_count=job.result_point_count,
                    chunk_count=len(chunks),
                    stream_seq_id=job.stream_seq_id,
                ),
            )
        registry.remove_surface_job(job.job_id)
    except Exception as exc:
        job.status = "error"
        async with send_lock:
            await _emit_surface_error(
                websocket,
                request_id=request_id,
                job_id=job.job_id,
                message=str(exc),
                code="surfaceProcessingFailed",
            )
        registry.remove_surface_job(job.job_id)
    finally:
        job.processing_task = None


async def _handle_begin_upload(
    websocket: WebSocket,
    registry: RuntimeRegistry,
    message: BeginSurfaceUploadCommand,
) -> None:
    active_job_id = getattr(websocket.state, "active_surface_job_id", None)
    if active_job_id:
        await _emit_surface_error(
            websocket,
            request_id=message.request_id,
            job_id=active_job_id,
            message="Finish or abort the current surface upload before starting a new one.",
            code="surfaceUploadAlreadyActive",
        )
        return

    job = registry.create_surface_job(
        owner_id=getattr(websocket.state, "surface_owner_id", None),
        config=message.config,
    )
    websocket.state.active_surface_job_id = job.job_id
    await send_event(
        websocket,
        SurfaceUploadStartedEvent(
            type="surfaceUploadStarted",
            request_id=message.request_id,
            job_id=job.job_id,
            config=job.config,
        ),
    )


async def _handle_finish_upload(
    websocket: WebSocket,
    registry: RuntimeRegistry,
    message: FinishSurfaceUploadCommand,
    send_lock: asyncio.Lock,
) -> None:
    job = registry.get_surface_job(message.job_id)
    if job is None:
        await _emit_surface_error(
            websocket,
            request_id=message.request_id,
            job_id=message.job_id,
            message=f'Unknown surface job "{message.job_id}".',
            code="surfaceJobNotFound",
        )
        return
    if job.raw_points is None:
        await _emit_surface_error(
            websocket,
            request_id=message.request_id,
            job_id=message.job_id,
            message="Surface upload is not complete yet.",
            code="surfaceUploadIncomplete",
        )
        return
    if job.processing_task is not None:
        await _emit_surface_error(
            websocket,
            request_id=message.request_id,
            job_id=message.job_id,
            message="Surface job is already processing.",
            code="surfaceJobAlreadyProcessing",
        )
        return

    job.status = "processing"
    websocket.state.active_surface_job_id = None
    job.processing_task = asyncio.create_task(
        _process_surface_job(websocket, registry, job, message.request_id, send_lock)
    )


async def _handle_abort_surface_job(
    websocket: WebSocket,
    registry: RuntimeRegistry,
    message: AbortSurfaceJobCommand,
) -> None:
    job = registry.get_surface_job(message.job_id)
    if job is None:
        await _emit_surface_error(
            websocket,
            request_id=message.request_id,
            job_id=message.job_id,
            message=f'Unknown surface job "{message.job_id}".',
            code="surfaceJobNotFound",
        )
        return

    job.abort_requested = True
    websocket.state.active_surface_job_id = None
    await _emit_aborted_if_needed(websocket, job, message.request_id)
    if job.processing_task is None:
        registry.remove_surface_job(job.job_id)


async def _handle_surface_command(
    websocket: WebSocket,
    registry: RuntimeRegistry,
    message: SurfaceClientMessage,
    send_lock: asyncio.Lock,
) -> None:
    if isinstance(message, BeginSurfaceUploadCommand):
        await _handle_begin_upload(websocket, registry, message)
        return
    if isinstance(message, FinishSurfaceUploadCommand):
        await _handle_finish_upload(websocket, registry, message, send_lock)
        return
    if isinstance(message, AbortSurfaceJobCommand):
        await _handle_abort_surface_job(websocket, registry, message)
        return
    await _emit_surface_error(
        websocket,
        message=f"Unsupported surface command {message.type!r}.",
        code="surfaceCommandUnsupported",
    )

async def websocket_surface_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    registry = get_registry(websocket)
    send_lock = asyncio.Lock()
    websocket.state.active_surface_job_id = None
    websocket.state.surface_owner_id = str(uuid4())

    try:
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break

            text = msg.get("text")
            if text is not None:
                try:
                    message = parse_surface_client_message_json(text)
                except ValidationError as exc:
                    async with send_lock:
                        await _emit_surface_error(
                            websocket,
                            message=f"Invalid surface client message: {exc}",
                            code="invalidSurfaceMessage",
                        )
                    continue
                async with send_lock:
                    await _handle_surface_command(websocket, registry, message, send_lock)
                continue

            payload = msg.get("bytes")
            if payload is not None:
                active_job_id = getattr(websocket.state, "active_surface_job_id", None)
                if not active_job_id:
                    async with send_lock:
                        await _emit_surface_error(
                            websocket,
                            message="No active surface upload. Begin an upload before sending binary chunks.",
                            code="surfaceUploadNotStarted",
                        )
                    continue

                job = registry.get_surface_job(active_job_id)
                if job is None:
                    async with send_lock:
                        await _emit_surface_error(
                            websocket,
                            job_id=active_job_id,
                            message=f'Unknown surface job "{active_job_id}".',
                            code="surfaceJobNotFound",
                        )
                    websocket.state.active_surface_job_id = None
                    continue

                try:
                    chunk = decode_pcd2_chunk(payload)
                    if job.assembly is None:
                        job.assembly = PcdAssembly(
                            total_points=chunk.total_points,
                            chunk_count=chunk.chunk_count,
                            minv=chunk.minv,
                            scale=chunk.scale,
                        )
                    points = job.assembly.add_chunk(chunk)
                except Exception as exc:
                    async with send_lock:
                        await _emit_surface_error(
                            websocket,
                            job_id=active_job_id,
                            message=str(exc),
                            code="surfaceUploadChunkInvalid",
                        )
                    continue

                if job.assembly is None:
                    chunks_received = 0
                    chunk_count = chunk.chunk_count
                else:
                    chunks_received = job.assembly.received_chunks
                    chunk_count = job.assembly.chunk_count

                async with send_lock:
                    await send_event(
                        websocket,
                        SurfaceUploadProgressEvent(
                            type="surfaceUploadProgress",
                            job_id=job.job_id,
                            chunks_received=chunks_received,
                            chunk_count=chunk_count,
                            point_count=chunk.total_points,
                        ),
                    )

                    if points is not None:
                        job.raw_points = points
                        job.original_point_count = int(points.shape[0])
                        job.assembly = None
                        job.status = "uploaded"
                        await send_event(
                            websocket,
                            SurfaceUploadCompletedEvent(
                                type="surfaceUploadCompleted",
                                job_id=job.job_id,
                                point_count=job.original_point_count,
                                chunk_count=chunk.chunk_count,
                            ),
                        )
                continue
    except WebSocketDisconnect:
        return
