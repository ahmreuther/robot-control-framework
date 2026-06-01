from __future__ import annotations

from dataclasses import dataclass, field

from backend.models.robot import (
    RobotActionState,
    RobotConnectionStatus,
    RobotJointState,
    RobotSessionInfo,
)


@dataclass
class RobotSession:
    """Runtime wrapper for one MotionDevice-bound robot."""

    info: RobotSessionInfo
    joint_state: RobotJointState = field(default_factory=RobotJointState)
    action_states: dict[str, RobotActionState] = field(default_factory=dict)
    joints_subscription_active: bool = False

    @property
    def robot_id(self) -> str:
        return self.info.robot_id

    @property
    def server_url(self) -> str:
        return self.info.server_url

    def to_info(self) -> RobotSessionInfo:
        return self.info

    def set_status(self, status: RobotConnectionStatus) -> None:
        self.info.status = status

    def update_joint_state(self, joint_state: RobotJointState) -> None:
        self.joint_state = joint_state

    def update_action_state(self, action_state: RobotActionState) -> None:
        self.action_states[action_state.action_name] = action_state

    def get_method_node_id(self, method_name: str) -> str | None:
        method = self.info.opcua.methods.get(method_name)
        if method is None:
            return None
        return method.node_id

    def require_method_node_id(self, method_name: str) -> str:
        node_id = self.get_method_node_id(method_name)
        if node_id is None:
            raise KeyError(f"Robot {self.robot_id} has no method binding for {method_name!r}")
        return node_id
