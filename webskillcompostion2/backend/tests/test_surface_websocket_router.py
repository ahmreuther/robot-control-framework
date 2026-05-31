import numpy as np
from fastapi.testclient import TestClient

from wsc2_backend.app import create_app
from wsc2_backend.geometry.pointcloud_transport import iter_encoded_pcd2_chunks
from wsc2_backend.websocket import surface_router


def test_surface_websocket_upload_and_process(monkeypatch) -> None:
    def fake_compute_surface_points_from_xyz(points_xyz, **kwargs):
        return np.asarray(points_xyz, dtype=np.float32)[:2]

    monkeypatch.setattr(
        surface_router,
        "compute_surface_points_from_xyz",
        fake_compute_surface_points_from_xyz,
    )

    app = create_app()
    points = np.array(
        [
            [0.0, 0.0, 0.0],
            [0.1, 0.0, 0.0],
            [0.0, 0.1, 0.0],
        ],
        dtype=np.float32,
    )
    payloads = [
        payload
        for payload, _chunk in iter_encoded_pcd2_chunks(
            points,
            chunk_points=10,
            seq_id=1,
        )
    ]

    with TestClient(app).websocket_connect("/ws/surface") as websocket:
        websocket.send_json(
            {
                "type": "beginSurfaceUpload",
                "requestId": "req-begin",
                "config": {
                    "minPoints": 1,
                },
            }
        )
        started = websocket.receive_json()
        job_id = started["jobId"]

        for payload in payloads:
            websocket.send_bytes(payload)
        upload_progress = websocket.receive_json()
        upload_completed = websocket.receive_json()

        websocket.send_json(
            {
                "type": "finishSurfaceUpload",
                "requestId": "req-finish",
                "jobId": job_id,
            }
        )

        progress = websocket.receive_json()
        ready = websocket.receive_json()
        result_chunk = websocket.receive_bytes()
        stream_completed = websocket.receive_json()

    assert started["type"] == "surfaceUploadStarted"
    assert started["requestId"] == "req-begin"
    assert upload_progress["type"] == "surfaceUploadProgress"
    assert upload_progress["jobId"] == job_id
    assert upload_completed == {
        "type": "surfaceUploadCompleted",
        "jobId": job_id,
        "pointCount": 3,
        "chunkCount": 1,
    }
    assert progress["type"] == "surfaceProcessingProgress"
    assert progress["stage"] == "processing_start"
    assert ready["type"] == "surfaceJobReady"
    assert ready["requestId"] == "req-finish"
    assert ready["jobId"] == job_id
    assert ready["originalPointCount"] == 3
    assert ready["resultPointCount"] == 2
    assert ready["streamSeqId"] == 1
    assert isinstance(result_chunk, bytes)
    assert stream_completed == {
        "type": "surfaceResultStreamCompleted",
        "jobId": job_id,
        "pointCount": 2,
        "chunkCount": 1,
        "streamSeqId": 1,
    }
