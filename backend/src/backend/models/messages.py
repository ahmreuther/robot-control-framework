from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import Field, TypeAdapter

from .address_space import AddressSpaceNode, AddressSpaceNodeDetails, AddressSpaceReference
from .base import ContractModel
from .robot import RobotActionState, RobotJointState, RobotSessionInfo
from .server import ServerSessionInfo


class ConnectServerCommand(ContractModel):
    type: Literal["connectServer"]
    request_id: str
    server_url: str


class DisconnectServerCommand(ContractModel):
    type: Literal["disconnectServer"]
    request_id: str
    server_url: str


class DiscoverRobotsCommand(ContractModel):
    type: Literal["discoverRobots"]
    request_id: str
    server_url: str


class SubscribeRobotJointsCommand(ContractModel):
    type: Literal["subscribeRobotJoints"]
    request_id: str
    robot_id: str


class UnsubscribeRobotJointsCommand(ContractModel):
    type: Literal["unsubscribeRobotJoints"]
    request_id: str
    robot_id: str


class CallRobotMethodCommand(ContractModel):
    type: Literal["callRobotMethod"]
    request_id: str
    robot_id: str
    method: str
    inputs: dict[str, Any] = Field(default_factory=dict)


class ExecuteRobotActionCommand(ContractModel):
    type: Literal["executeRobotAction"]
    request_id: str
    robot_id: str
    action_name: str
    inputs: dict[str, Any] = Field(default_factory=dict)


class HaltRobotActionCommand(ContractModel):
    type: Literal["haltRobotAction"]
    request_id: str
    robot_id: str
    action_name: str


class ResetRobotActionCommand(ContractModel):
    type: Literal["resetRobotAction"]
    request_id: str
    robot_id: str
    action_name: str


class SubscribeNodeCommand(ContractModel):
    type: Literal["subscribeNode"]
    request_id: str
    server_url: str
    node_id: str


class UnsubscribeNodeCommand(ContractModel):
    type: Literal["unsubscribeNode"]
    request_id: str
    server_url: str
    node_id: str


class SubscribeEventCommand(ContractModel):
    type: Literal["subscribeEvent"]
    request_id: str
    server_url: str
    node_id: str


class UnsubscribeEventCommand(ContractModel):
    type: Literal["unsubscribeEvent"]
    request_id: str
    server_url: str
    node_id: str


class SubscribeRobotModeCommand(ContractModel):
    type: Literal["subscribeRobotMode"]
    request_id: str
    robot_id: str


class UnsubscribeRobotModeCommand(ContractModel):
    type: Literal["unsubscribeRobotMode"]
    request_id: str
    robot_id: str


class CallRawMethodCommand(ContractModel):
    type: Literal["callRawMethod"]
    request_id: str
    server_url: str
    node_id: str
    inputs: dict[str, Any] = Field(default_factory=dict)


class BrowseAddressSpaceRootCommand(ContractModel):
    type: Literal["browseAddressSpaceRoot"]
    request_id: str
    server_url: str


class BrowseAddressSpaceChildrenCommand(ContractModel):
    type: Literal["browseAddressSpaceChildren"]
    request_id: str
    server_url: str
    node_id: str


class BrowseAddressSpaceReferencesCommand(ContractModel):
    type: Literal["browseAddressSpaceReferences"]
    request_id: str
    server_url: str
    node_id: str


class BrowseAddressSpaceNodeDetailsCommand(ContractModel):
    type: Literal["browseAddressSpaceNodeDetails"]
    request_id: str
    server_url: str
    node_id: str


ClientMessage = Annotated[
    ConnectServerCommand
    | DisconnectServerCommand
    | DiscoverRobotsCommand
    | SubscribeRobotJointsCommand
    | UnsubscribeRobotJointsCommand
    | CallRobotMethodCommand
    | ExecuteRobotActionCommand
    | HaltRobotActionCommand
    | ResetRobotActionCommand
    | SubscribeNodeCommand
    | UnsubscribeNodeCommand
    | SubscribeEventCommand
    | UnsubscribeEventCommand
    | SubscribeRobotModeCommand
    | UnsubscribeRobotModeCommand
    | CallRawMethodCommand
    | BrowseAddressSpaceRootCommand
    | BrowseAddressSpaceChildrenCommand
    | BrowseAddressSpaceReferencesCommand
    | BrowseAddressSpaceNodeDetailsCommand,
    Field(discriminator="type"),
]


class ServerConnectedEvent(ContractModel):
    type: Literal["serverConnected"]
    request_id: str | None = None
    server: ServerSessionInfo


class ServerDisconnectedEvent(ContractModel):
    type: Literal["serverDisconnected"]
    request_id: str | None = None
    server_url: str


class RobotsDiscoveredEvent(ContractModel):
    type: Literal["robotsDiscovered"]
    request_id: str | None = None
    server_url: str
    robots: list[RobotSessionInfo]


class RobotInfoEvent(ContractModel):
    type: Literal["robotInfo"]
    request_id: str | None = None
    server_url: str
    robot_id: str
    robot: RobotSessionInfo


class RobotJointStateEvent(ContractModel):
    type: Literal["robotJointState"]
    server_url: str
    robot_id: str
    data: RobotJointState


class RobotModeChangedEvent(ContractModel):
    type: Literal["robotModeChanged"]
    server_url: str
    robot_id: str
    mode: str


class RobotActionStateEvent(ContractModel):
    type: Literal["robotActionState"]
    request_id: str | None = None
    server_url: str
    robot_id: str
    data: RobotActionState


class MethodResultEvent(ContractModel):
    type: Literal["methodResult"]
    request_id: str | None = None
    server_url: str
    robot_id: str | None = None
    node_id: str | None = None
    result: Any = None


class NodeValueChangedEvent(ContractModel):
    type: Literal["nodeValueChanged"]
    server_url: str
    node_id: str
    value: Any
    robot_id: str | None = None


class OpcUaEventNotificationEvent(ContractModel):
    type: Literal["opcuaEvent"]
    server_url: str
    node_id: str
    event: Any


class ErrorEvent(ContractModel):
    type: Literal["error"]
    request_id: str | None = None
    server_url: str | None = None
    robot_id: str | None = None
    message: str
    code: str | None = None


class AddressSpaceRootEvent(ContractModel):
    type: Literal["addressSpaceRoot"]
    request_id: str | None = None
    server_url: str
    nodes: list[AddressSpaceNode]


class AddressSpaceChildrenEvent(ContractModel):
    type: Literal["addressSpaceChildren"]
    request_id: str | None = None
    server_url: str
    node_id: str
    nodes: list[AddressSpaceNode]


class AddressSpaceReferencesEvent(ContractModel):
    type: Literal["addressSpaceReferences"]
    request_id: str | None = None
    server_url: str
    node_id: str
    references: list[AddressSpaceReference]


class AddressSpaceNodeDetailsEvent(ContractModel):
    type: Literal["addressSpaceNodeDetails"]
    request_id: str | None = None
    server_url: str
    node_id: str
    details: AddressSpaceNodeDetails


ServerMessage = Annotated[
    ServerConnectedEvent
    | ServerDisconnectedEvent
    | RobotsDiscoveredEvent
    | RobotInfoEvent
    | RobotJointStateEvent
    | RobotModeChangedEvent
    | RobotActionStateEvent
    | MethodResultEvent
    | NodeValueChangedEvent
    | OpcUaEventNotificationEvent
    | ErrorEvent
    | AddressSpaceRootEvent
    | AddressSpaceChildrenEvent
    | AddressSpaceReferencesEvent
    | AddressSpaceNodeDetailsEvent,
    Field(discriminator="type"),
]

_client_message_adapter = TypeAdapter(ClientMessage)
_server_message_adapter = TypeAdapter(ServerMessage)


def parse_client_message_json(raw: str) -> ClientMessage:
    return _client_message_adapter.validate_json(raw)


def parse_server_message_json(raw: str) -> ServerMessage:
    return _server_message_adapter.validate_json(raw)
