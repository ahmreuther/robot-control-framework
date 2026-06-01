from __future__ import annotations

from enum import StrEnum
from hashlib import sha256

from pydantic import Field

from .base import ContractModel
from .opcua import AxisBinding, MethodBinding, MotionDeviceBinding


def make_robot_id(server_url: str, motion_device_node_id: str) -> str:
    """Create a stable frontend/backend robot id from server and MotionDevice identity."""

    digest = sha256(f"{server_url}#{motion_device_node_id}".encode("utf-8")).hexdigest()
    return f"robot-{digest[:16]}"


class RobotConnectionStatus(StrEnum):
    UNKNOWN = "unknown"
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"


class RobotInfo(ContractModel):
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None


class RobotOpcUaInterface(ContractModel):
    """Robot-specific projection of the MotionDevice subtree."""

    variables: dict[str, str] = Field(default_factory=dict)
    methods: dict[str, MethodBinding] = Field(default_factory=dict)
    axes: dict[str, AxisBinding] = Field(default_factory=dict)


class RobotJointState(ContractModel):
    """Latest robot joint/axis values as backend data, before URDF mapping."""

    axis_values: dict[str, float] = Field(default_factory=dict)
    unit: str | dict[str, object] | None = None


class RobotSessionInfo(ContractModel):
    """Serializable description of one MotionDevice-bound backend robot."""

    robot_id: str
    server_url: str
    display_name: str
    motion_device: MotionDeviceBinding
    info: RobotInfo = Field(default_factory=RobotInfo)
    opcua: RobotOpcUaInterface = Field(default_factory=RobotOpcUaInterface)
    status: RobotConnectionStatus = RobotConnectionStatus.UNKNOWN

    @classmethod
    def from_motion_device(
        cls,
        *,
        server_url: str,
        motion_device: MotionDeviceBinding,
        info: RobotInfo | None = None,
        opcua: RobotOpcUaInterface | None = None,
        status: RobotConnectionStatus = RobotConnectionStatus.UNKNOWN,
    ) -> "RobotSessionInfo":
        return cls(
            robot_id=make_robot_id(server_url, motion_device.node_id),
            server_url=server_url,
            display_name=motion_device.display_name or motion_device.browse_name or motion_device.node_id,
            motion_device=motion_device,
            info=info or RobotInfo(),
            opcua=opcua or RobotOpcUaInterface(),
            status=status,
        )
