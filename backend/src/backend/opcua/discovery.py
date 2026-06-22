from __future__ import annotations

from pydantic import Field

from backend.models.base import ContractModel
from backend.models.opcua import MotionDeviceBinding
from backend.models.robot import (
    RobotActionBinding,
    RobotInfo,
    RobotOpcUaInterface,
    RobotSessionInfo,
)
from backend.models.server import ServerSessionInfo


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
            actions=build_robot_action_bindings(descriptor.opcua),
        )
        for descriptor in motion_devices
    ]


def build_robot_action_bindings(
    opcua: RobotOpcUaInterface,
) -> dict[str, RobotActionBinding]:
    return {
        **{
            skill_name: build_skill_action_binding(opcua, skill_name)
            for skill_name in opcua.skills
        },
        **{
            method_name: build_method_action_binding(opcua, method_name)
            for method_name in opcua.methods
        },
    }


def build_method_action_binding(
    opcua: RobotOpcUaInterface,
    method_name: str,
) -> RobotActionBinding:
    method = opcua.methods[method_name]
    return RobotActionBinding(
        kind="method",
        target_name=method_name,
        display_name=method.display_name,
        discovery_path=method.discovery_path,
        method_node_id=method.node_id,
        parameter_names=[
            argument.name for argument in method.input_arguments if argument.name
        ],
        result_names=[
            argument.name for argument in method.output_arguments if argument.name
        ],
    )


def build_skill_action_binding(
    opcua: RobotOpcUaInterface,
    skill_name: str,
) -> RobotActionBinding:
    skill = opcua.skills[skill_name]
    return RobotActionBinding(
        kind="skill",
        target_name=skill_name,
        display_name=skill.display_name,
        discovery_path=skill.discovery_path,
        skill_node_id=skill.node_id,
        parameter_set_node_id=skill.parameter_set_node_id,
        result_set_node_id=skill.result_set_node_id,
        current_state_node_id=skill.current_state_node_id,
        start_node_id=skill.start_node_id,
        halt_node_id=skill.halt_node_id,
        reset_node_id=skill.reset_node_id,
        suspend_node_id=skill.suspend_node_id,
        resume_node_id=skill.resume_node_id,
        parameter_names=list(skill.parameters),
        result_names=list(skill.results),
    )
