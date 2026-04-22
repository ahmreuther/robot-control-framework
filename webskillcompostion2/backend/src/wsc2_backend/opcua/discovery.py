from __future__ import annotations

from pydantic import Field

from wsc2_backend.models.base import ContractModel
from wsc2_backend.models.opcua import MotionDeviceBinding
from wsc2_backend.models.robot import RobotInfo, RobotOpcUaInterface, RobotSessionInfo
from wsc2_backend.models.server import ServerSessionInfo


class MotionDeviceDescriptor(ContractModel):
    """Discovery result before the backend turns a MotionDevice into a RobotSession."""

    motion_device: MotionDeviceBinding
    info: RobotInfo = Field(default_factory=RobotInfo)
    opcua: RobotOpcUaInterface = Field(default_factory=RobotOpcUaInterface)


class ServerDiscoveryResult(ContractModel):
    """Robotics discovery result for one OPC UA server."""

    server: ServerSessionInfo
    robots: list[RobotSessionInfo] = Field(default_factory=list)


def build_robot_session_infos(
    *,
    server_url: str,
    motion_devices: list[MotionDeviceDescriptor],
) -> list[RobotSessionInfo]:
    """Project discovered MotionDevices into serializable backend robot sessions."""

    return [
        RobotSessionInfo.from_motion_device(
            server_url=server_url,
            motion_device=descriptor.motion_device,
            info=descriptor.info,
            opcua=descriptor.opcua,
        )
        for descriptor in motion_devices
    ]
