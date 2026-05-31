from __future__ import annotations

import struct
from dataclasses import dataclass

import numpy as np


PCD_MAGIC = b"PCD2"
PCD_HEADER_FORMAT = "<4s6I6f"
PCD_HEADER_SIZE = struct.calcsize(PCD_HEADER_FORMAT)


@dataclass(slots=True)
class DecodedPcdChunk:
    seq_id: int
    chunk_index: int
    chunk_count: int
    total_points: int
    start_index: int
    point_count: int
    minv: np.ndarray
    scale: np.ndarray
    quantized_points: np.ndarray


def quantize_points_to_pcd2_chunks(
    points: np.ndarray,
    *,
    chunk_points: int,
    seq_id: int,
):
    pts = np.asarray(points, dtype=np.float32)
    total = int(pts.shape[0])
    if total <= 0:
        return

    minv = pts.min(axis=0)
    maxv = pts.max(axis=0)
    extent = np.maximum(maxv - minv, 1e-9)
    scale = extent / 65535.0
    chunk_count = (total + chunk_points - 1) // chunk_points

    for chunk_index in range(chunk_count):
        start = chunk_index * chunk_points
        end = min(start + chunk_points, total)
        sub = pts[start:end]
        quantized = np.round((sub - minv) / scale).clip(0, 65535).astype(np.uint16)
        yield {
            "seq_id": seq_id,
            "chunk_index": chunk_index,
            "chunk_count": chunk_count,
            "total_points": total,
            "start_index": start,
            "point_count": int(end - start),
            "minv": minv,
            "scale": scale,
            "quantized_points": quantized,
        }


def encode_pcd2_chunk(chunk: dict[str, object]) -> bytes:
    minv = np.asarray(chunk["minv"], dtype=np.float32)
    scale = np.asarray(chunk["scale"], dtype=np.float32)
    quantized = np.asarray(chunk["quantized_points"], dtype=np.uint16)
    header = struct.pack(
        PCD_HEADER_FORMAT,
        PCD_MAGIC,
        int(chunk["seq_id"]),
        int(chunk["chunk_index"]),
        int(chunk["chunk_count"]),
        int(chunk["total_points"]),
        int(chunk["start_index"]),
        int(chunk["point_count"]),
        float(minv[0]),
        float(minv[1]),
        float(minv[2]),
        float(scale[0]),
        float(scale[1]),
        float(scale[2]),
    )
    return header + quantized.tobytes(order="C")


def iter_encoded_pcd2_chunks(
    points: np.ndarray,
    *,
    chunk_points: int,
    seq_id: int,
):
    for chunk in quantize_points_to_pcd2_chunks(
        points,
        chunk_points=chunk_points,
        seq_id=seq_id,
    ):
        yield encode_pcd2_chunk(chunk), chunk


def decode_pcd2_chunk(payload: bytes) -> DecodedPcdChunk:
    if len(payload) < PCD_HEADER_SIZE:
        raise ValueError(f"PCD2 payload too small: expected at least {PCD_HEADER_SIZE} bytes.")

    if payload[:4] != PCD_MAGIC:
        raise ValueError("PCD2 payload has invalid magic header.")

    (
        _magic,
        seq_id,
        chunk_index,
        chunk_count,
        total_points,
        start_index,
        point_count,
        minx,
        miny,
        minz,
        scalex,
        scaley,
        scalez,
    ) = struct.unpack_from(PCD_HEADER_FORMAT, payload, 0)

    expected_data_len = int(point_count) * 3 * 2
    data = payload[PCD_HEADER_SIZE:]
    if len(data) != expected_data_len:
        raise ValueError(
            f"PCD2 payload has wrong data length: got {len(data)}, expected {expected_data_len}."
        )

    quantized = np.frombuffer(data, dtype=np.uint16).reshape(-1, 3)
    return DecodedPcdChunk(
        seq_id=int(seq_id),
        chunk_index=int(chunk_index),
        chunk_count=int(chunk_count),
        total_points=int(total_points),
        start_index=int(start_index),
        point_count=int(point_count),
        minv=np.array([minx, miny, minz], dtype=np.float32),
        scale=np.array([scalex, scaley, scalez], dtype=np.float32),
        quantized_points=quantized.copy(),
    )


class PcdAssembly:
    __slots__ = ("total_points", "chunk_count", "received_chunks", "minv", "scale", "qbuf")

    def __init__(
        self,
        *,
        total_points: int,
        chunk_count: int,
        minv: np.ndarray,
        scale: np.ndarray,
    ) -> None:
        self.total_points = int(total_points)
        self.chunk_count = int(chunk_count)
        self.received_chunks = 0
        self.minv = np.asarray(minv, dtype=np.float32)
        self.scale = np.asarray(scale, dtype=np.float32)
        self.qbuf = np.empty((self.total_points, 3), dtype=np.uint16)

    def add_chunk(self, chunk: DecodedPcdChunk) -> np.ndarray | None:
        end_index = chunk.start_index + chunk.point_count
        if chunk.start_index < 0 or end_index > self.total_points:
            raise ValueError(
                f"PCD2 chunk range out of bounds: {chunk.start_index}:{end_index} of {self.total_points}."
            )

        self.qbuf[chunk.start_index:end_index, :] = chunk.quantized_points
        self.received_chunks += 1
        if self.received_chunks < self.chunk_count:
            return None

        return self.minv[None, :] + self.qbuf.astype(np.float32) * self.scale[None, :]
