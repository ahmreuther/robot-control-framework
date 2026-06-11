from backend.models.opcua import MotionDeviceBinding
from backend.models.robot import RobotSessionInfo
from backend.models.surface import SurfaceProcessingConfig
from backend.runtime.robot_session import RobotSession
from backend.services.runtime_registry import RuntimeRegistry


def make_robot(server_url: str, node_id: str, name: str) -> RobotSession:
    return RobotSession(
        info=RobotSessionInfo.from_motion_device(
            server_url=server_url,
            motion_device=MotionDeviceBinding(nodeId=node_id, displayName=name),
        )
    )


def test_registry_indexes_robots_by_server_and_robot_id() -> None:
    registry = RuntimeRegistry()
    server = registry.ensure_server("opc.tcp://127.0.0.1:4840")
    robots = [
        make_robot(server.server_url, "ns=4;s=MotionDevice_1", "Robot 1"),
        make_robot(server.server_url, "ns=4;s=MotionDevice_2", "Robot 2"),
    ]

    registry.replace_server_robots(server, robots)

    assert server.to_info().motion_device_ids == [robots[0].robot_id, robots[1].robot_id]
    assert registry.get_robot(robots[0].robot_id) is robots[0]
    assert registry.get_robot(robots[1].robot_id) is robots[1]


def test_removing_server_removes_its_robots_from_global_lookup() -> None:
    registry = RuntimeRegistry()
    server = registry.ensure_server("opc.tcp://127.0.0.1:4840")
    robot = make_robot(server.server_url, "ns=4;s=MotionDevice_1", "Robot 1")
    registry.replace_server_robots(server, [robot])

    removed = registry.remove_server(server.server_url)

    assert removed is server
    assert registry.get_server(server.server_url) is None
    assert registry.get_robot(robot.robot_id) is None


def test_registry_tracks_surface_jobs() -> None:
    registry = RuntimeRegistry()

    first = registry.create_surface_job(
        owner_id="socket-1",
        config=SurfaceProcessingConfig(),
    )
    second = registry.create_surface_job(
        owner_id="socket-1",
        config=SurfaceProcessingConfig(voxel_size=0.02),
    )

    assert first.job_id == "surface-job-1"
    assert second.job_id == "surface-job-2"
    assert registry.get_surface_job(first.job_id) is first

    removed = registry.remove_surface_job(first.job_id)

    assert removed is first
    assert registry.get_surface_job(first.job_id) is None
