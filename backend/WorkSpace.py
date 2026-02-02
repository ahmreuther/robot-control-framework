import asyncio
import os
import struct
import numpy as np
from fastapi import WebSocket, APIRouter

from modules.VPC2SPC import (
    compute_outer_surface_points_from_xyz,  # ✅ neu: Array-basierte API
)

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    force=True,
)

log = logging.getLogger("workspace")

PCD_DEBUG = os.getenv("PCD_DEBUG", "").lower() in {"1", "true", "yes", "on"}
PCD_DUMP_DIR = os.getenv("PCD_DUMP_DIR", "./pcd_dumps")

router = APIRouter()

PCD_MAGIC = b"PCD2"
PCD_HEADER_SIZE = 52  # <4s6I6f

handlers = {}

DEFAULT_PCD_CFG = {
    "voxel_size": 0.01,
    "sigma": 0.02,
    "iso_level": 0.30,
    "padding": 0.05,
    "closing_radius": 0,
}


# -----------------------------
# Quantize + send helper (server -> frontend)
# -----------------------------
def quantize_points_to_pcd2_chunks(points: np.ndarray, chunk_points: int, seq_id: int):
    pts = points.astype(np.float32, copy=False)
    total = int(pts.shape[0])
    if total <= 0:
        return

    minv = pts.min(axis=0)
    maxv = pts.max(axis=0)
    d = np.maximum(maxv - minv, 1e-9)
    scale = d / 65535.0

    chunk_count = (total + chunk_points - 1) // chunk_points

    for chunk_index in range(chunk_count):
        s = chunk_index * chunk_points
        e = min(s + chunk_points, total)
        n = e - s
        sub = pts[s:e]
        q = np.round((sub - minv) / scale).clip(0, 65535).astype(np.uint16)
        yield chunk_index, chunk_count, total, s, n, minv, scale, q


async def send_points_pcd2(
    websocket: WebSocket,
    points: np.ndarray,
    kind: str,
    seq_id: int,
    chunk_points: int = 200000
):
    await websocket.send_text(f"pcd_kind|{seq_id}|{kind}")

    for chunk_index, chunk_count, total, start_index, n, minv, scale, q in \
            quantize_points_to_pcd2_chunks(points, chunk_points, seq_id):

        header = struct.pack(
            "<4s6I6f",
            PCD_MAGIC,
            int(seq_id),
            int(chunk_index),
            int(chunk_count),
            int(total),
            int(start_index),
            int(n),
            float(minv[0]), float(minv[1]), float(minv[2]),
            float(scale[0]), float(scale[1]), float(scale[2]),
        )
        await websocket.send_bytes(header + q.tobytes(order="C"))

        if (chunk_index + 1) == chunk_count or (chunk_index + 1) % 10 == 0:
            await websocket.send_text(f"{kind}_progress|{seq_id}|{chunk_index+1}|{chunk_count}")


# -----------------------------
# Assembly storage (frontend -> server)
# -----------------------------
class PcdAssembly:
    __slots__ = ("total", "chunk_count", "got", "minv", "scale", "qbuf")
    def __init__(self, total: int, chunk_count: int, minv: np.ndarray, scale: np.ndarray):
        self.total = int(total)
        self.chunk_count = int(chunk_count)
        self.got = 0
        self.minv = minv.astype(np.float32)
        self.scale = scale.astype(np.float32)
        self.qbuf = np.empty((self.total, 3), dtype=np.uint16)


async def handle_pcd2_bytes(app, websocket: WebSocket, payload: bytes):
    if len(payload) < PCD_HEADER_SIZE:
        if PCD_DEBUG:
            log.info(f"[PCD2] drop: payload too small len={len(payload)}")
        return
    if payload[:4] != PCD_MAGIC:
        if PCD_DEBUG:
            log.info(f"[PCD2] drop: bad magic head={payload[:4]!r} len={len(payload)}")
        return

    magic, seq_id, chunk_index, chunk_count, total_points, start_index, n_chunk, \
        minx, miny, minz, scalex, scaley, scalez = struct.unpack_from("<4s6I6f", payload, 0)

    websocket.state.last_pcd_seq = int(seq_id)

    abort_seqs = getattr(websocket.state, "pcd_abort_seqs", set())
    if seq_id in abort_seqs:
        asm_map = getattr(app.state, "pcd_assemblies", None)
        if asm_map is not None and seq_id in asm_map:
            del asm_map[seq_id]
        return

    data = payload[PCD_HEADER_SIZE:]
    expected = int(n_chunk) * 3 * 2
    if len(data) != expected:
        if PCD_DEBUG:
            log.info(
                f"[PCD2] bad_len seq={seq_id} idx={chunk_index} got={len(data)} exp={expected}"
            )
        await websocket.send_text(
            f"pcd_err|bad_len|seq={seq_id}|idx={chunk_index}|got={len(data)}|exp={expected}"
        )
        return

    asm_map = getattr(app.state, "pcd_assemblies", None)
    if asm_map is None:
        app.state.pcd_assemblies = {}
        asm_map = app.state.pcd_assemblies

    asm = asm_map.get(seq_id)
    if asm is None:
        minv = np.array([minx, miny, minz], dtype=np.float32)
        scale = np.array([scalex, scaley, scalez], dtype=np.float32)
        asm = PcdAssembly(total_points, chunk_count, minv, scale)
        asm_map[seq_id] = asm
        log.info(f"[PCD2] begin seq={seq_id} total={total_points} chunks={chunk_count}")
        await websocket.send_text(f"pcd_begin|{seq_id}|{total_points}|{chunk_count}")

    if PCD_DEBUG and (chunk_index == 0 or chunk_index + 1 == chunk_count):
        log.info(
            f"[PCD2] recv seq={seq_id} chunk={chunk_index+1}/{chunk_count} n={n_chunk} bytes={len(payload)}"
        )

    q = np.frombuffer(data, dtype=np.uint16).reshape(-1, 3)

    s = int(start_index)
    e = s + q.shape[0]
    if s < 0 or e > asm.total:
        await websocket.send_text(f"pcd_err|bad_range|seq={seq_id}|start={s}|end={e}|total={asm.total}")
        return

    asm.qbuf[s:e, :] = q
    asm.got += 1

    if asm.got == asm.chunk_count or asm.got % 2 == 0:
        await websocket.send_text(f"pcd_progress|{seq_id}|{asm.got}|{asm.chunk_count}")

    if asm.got < asm.chunk_count:
        return

    pts = asm.minv[None, :] + asm.qbuf.astype(np.float32) * asm.scale[None, :]
    del asm_map[seq_id]

    abort_seqs = getattr(websocket.state, "pcd_abort_seqs", set())
    if seq_id in abort_seqs:
        await websocket.send_text(f"pcd_status|{seq_id}|aborted")
        return

    await websocket.send_text(f"pcd_ok|{seq_id}|{pts.shape[0]}")
    log.info(f"[PCD2] done seq={seq_id} points={pts.shape[0]}")

    if PCD_DEBUG:
        try:
            os.makedirs(PCD_DUMP_DIR, exist_ok=True)
            dump_base = os.path.join(PCD_DUMP_DIR, f"pcd_{seq_id}")
            np.save(dump_base + ".npy", pts)
            sample = pts[: min(10, pts.shape[0])]
            np.savetxt(dump_base + "_sample.xyz", sample, fmt="%.6f")
            log.info(f"[PCD2] dump ok seq={seq_id} -> {dump_base}.npy (sample: {sample.shape[0]} pts)")
        except Exception:
            log.exception("[PCD2] dump failed")

    # processing
    await websocket.send_text(f"pcd_status|{seq_id}|processing_start")

    try:
        loop = asyncio.get_running_loop()

        def is_aborted() -> bool:
            return seq_id in getattr(websocket.state, "pcd_abort_seqs", set())

        def status_cb(stage: str, msg: str | None = None):
            if is_aborted():
                return
            text = f"pcd_status|{seq_id}|{stage}"
            if msg:
                text += f"|{msg}"
            asyncio.run_coroutine_threadsafe(websocket.send_text(text), loop)

        def _process():
            cfg = getattr(websocket.state, "pcd_cfg", DEFAULT_PCD_CFG)
            #  DIRECT: point cloud from websocket -> surface points (outer shell centers)
            return compute_outer_surface_points_from_xyz(
                pts,
                voxel_size=float(cfg.get("voxel_size", DEFAULT_PCD_CFG["voxel_size"])),
                sigma=float(cfg.get("sigma", DEFAULT_PCD_CFG["sigma"])),
                iso_level=float(cfg.get("iso_level", DEFAULT_PCD_CFG["iso_level"])),
                padding=float(cfg.get("padding", DEFAULT_PCD_CFG["padding"])),
                closing_radius=int(cfg.get("closing_radius", DEFAULT_PCD_CFG["closing_radius"])),
                status_cb=status_cb,
            )

        surface_pts = await asyncio.to_thread(_process)

        if is_aborted():
            await websocket.send_text(f"pcd_status|{seq_id}|aborted")
            return

        surface_pts = np.asarray(surface_pts, dtype=np.float32).reshape(-1, 3)

        if surface_pts.shape[0] == 0:
            raise RuntimeError("surface_pts is empty (check iso_level/sigma/voxel_size).")

    except Exception as e:
        await websocket.send_text(f"pcd_status|{seq_id}|processing_error|{type(e).__name__}:{e}")
        log.exception("[PCD2] processing error")
        return

    await websocket.send_text(f"pcd_status|{seq_id}|processing_done|surface_pts={surface_pts.shape[0]}")

    if seq_id in getattr(websocket.state, "pcd_abort_seqs", set()):
        await websocket.send_text(f"pcd_status|{seq_id}|aborted")
        return

    # send surface back
    surface_seq = (int(seq_id) + 1) & 0xFFFFFFFF
    await send_points_pcd2(websocket, surface_pts, kind="surface", seq_id=surface_seq, chunk_points=200000)
    await websocket.send_text(f"surface_done|{surface_seq}")


@router.websocket("/ws_workspace")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    log.info("Workspace WebSocket connected.")

    websocket.state.pcd_cfg = dict(DEFAULT_PCD_CFG)
    websocket.state.pcd_abort_seqs = set()
    websocket.state.last_pcd_seq = None

    app = websocket.scope["app"]

    try:
        while True:
            msg = await websocket.receive()

            mtype = msg.get("type")
            if mtype == "websocket.disconnect":
                log.info("WebSocket disconnected.")
                break

            text = msg.get("text")
            if text is not None:
                log.info(f"WebSocket received text: {text}")

                if text == "pcd_abort":
                    seq = getattr(websocket.state, "last_pcd_seq", None)
                    if isinstance(seq, int):
                        websocket.state.pcd_abort_seqs.add(seq)
                        asm_map = getattr(app.state, "pcd_assemblies", None)
                        if asm_map is not None and seq in asm_map:
                            del asm_map[seq]
                        await websocket.send_text(f"pcd_abort_ok|seq={seq}")
                    else:
                        await websocket.send_text("pcd_abort_ok")
                    continue

                if text.startswith("pcd_abort|"):
                    # format: pcd_abort|seq=123
                    parts = text.split("|")[1:]
                    seq = None
                    for part in parts:
                        if part.startswith("seq="):
                            try:
                                seq = int(part.split("=", 1)[1]) & 0xFFFFFFFF
                            except ValueError:
                                seq = None
                    if seq is not None:
                        websocket.state.pcd_abort_seqs.add(seq)
                        asm_map = getattr(app.state, "pcd_assemblies", None)
                        if asm_map is not None and seq in asm_map:
                            del asm_map[seq]
                        await websocket.send_text(f"pcd_abort_ok|seq={seq}")
                    else:
                        await websocket.send_text("pcd_abort_ok")
                    continue

                if text.startswith("pcd_cfg|"):
                    cfg = getattr(websocket.state, "pcd_cfg", dict(DEFAULT_PCD_CFG))
                    parts = text.split("|")[1:]
                    for part in parts:
                        if "=" not in part:
                            continue
                        k, v = part.split("=", 1)
                        try:
                            cfg[k] = float(v)
                        except ValueError:
                            continue
                    websocket.state.pcd_cfg = cfg
                    await websocket.send_text("pcd_cfg_ok")
                    continue

                if text == "status":
                    await websocket.send_text("status_ok")
                    continue
                if text == "ping":
                    await websocket.send_text("pong")
                    continue

                handled = False
                for prefix, fn in handlers.items():
                    if text.startswith(prefix):
                        await fn(websocket, text[len(prefix):])
                        handled = True
                        break
                if not handled:
                    await websocket.send_text("err|unknown_command")
                continue

            payload = msg.get("bytes")
            if payload is not None:
                if PCD_DEBUG:
                    log.info(f"WebSocket received bytes: len={len(payload)}")
                await handle_pcd2_bytes(app, websocket, payload)
                continue

            log.info(f"WebSocket received unknown message keys: {list(msg.keys())}")

    except Exception:
        log.exception("WebSocket exception")
