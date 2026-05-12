from __future__ import annotations

from collections.abc import Awaitable, Callable

from wsc2_backend.models.messages import (
    AddressSpaceChildrenEvent,
    AddressSpaceNodeDetailsEvent,
    AddressSpaceReferencesEvent,
    AddressSpaceRootEvent,
    BrowseAddressSpaceChildrenCommand,
    BrowseAddressSpaceNodeDetailsCommand,
    BrowseAddressSpaceReferencesCommand,
    BrowseAddressSpaceRootCommand,
    CallRobotMethodCommand,
    CallRawMethodCommand,
    ClientMessage,
    ConnectServerCommand,
    DisconnectServerCommand,
    DiscoverRobotsCommand,
    ErrorEvent,
    MethodResultEvent,
    RobotJointStateEvent,
    RobotModeChangedEvent,
    NodeValueChangedEvent,
    OpcUaEventNotificationEvent,
    RobotsDiscoveredEvent,
    ServerConnectedEvent,
    ServerDisconnectedEvent,
    ServerMessage,
    SubscribeEventCommand,
    SubscribeNodeCommand,
    SubscribeRobotJointsCommand,
    SubscribeRobotModeCommand,
    UnsubscribeEventCommand,
    UnsubscribeNodeCommand,
    UnsubscribeRobotJointsCommand,
    UnsubscribeRobotModeCommand,
)
from wsc2_backend.models.robot import RobotConnectionStatus, RobotJointState
from wsc2_backend.opcua.method_calls import MethodInputError
from wsc2_backend.opcua.server_connection import AsyncUaServerConnection
from wsc2_backend.opcua.discovery import ServerDiscoveryResult
from wsc2_backend.services.runtime_registry import RuntimeRegistry

from .robot_session import RobotSession

ConnectionFactory = Callable[[str], AsyncUaServerConnection]
DEFAULT_CONNECTION_FACTORY: ConnectionFactory = AsyncUaServerConnection
EventEmitter = Callable[[ServerMessage], Awaitable[None]]


def error_event(
    *,
    message: str,
    request_id: str | None = None,
    server_url: str | None = None,
    robot_id: str | None = None,
    code: str | None = None,
) -> ErrorEvent:
    return ErrorEvent(
        type="error",
        request_id=request_id,
        server_url=server_url,
        robot_id=robot_id,
        message=message,
        code=code,
    )


def register_discovery_result(
    *,
    registry: RuntimeRegistry,
    result: ServerDiscoveryResult,
) -> tuple[ServerConnectedEvent, RobotsDiscoveredEvent]:
    server = registry.ensure_server(result.server.server_url)
    server.mark_connected(
        namespace_uris=result.server.namespace_uris,
        is_robotics_server=result.server.is_robotics_server,
    )

    robot_sessions = [RobotSession(info=robot) for robot in result.robots]
    for robot in robot_sessions:
        robot.set_status(RobotConnectionStatus.CONNECTED)
    registry.replace_server_robots(server, robot_sessions)

    return (
        ServerConnectedEvent(type="serverConnected", server=server.to_info()),
        RobotsDiscoveredEvent(
            type="robotsDiscovered",
            server_url=result.server.server_url,
            robots=[robot.to_info() for robot in robot_sessions],
        ),
    )


def ensure_connection(
    *,
    server_url: str,
    registry: RuntimeRegistry,
    connection_factory: ConnectionFactory | None = None,
) -> AsyncUaServerConnection:
    server = registry.ensure_server(server_url)
    if server.connection is None:
        server.connection = (connection_factory or DEFAULT_CONNECTION_FACTORY)(server_url)
    return server.connection


async def discover_and_register(
    *,
    server_url: str,
    registry: RuntimeRegistry,
    connection_factory: ConnectionFactory | None = None,
) -> tuple[ServerConnectedEvent, RobotsDiscoveredEvent]:
    connection = ensure_connection(
        server_url=server_url,
        registry=registry,
        connection_factory=connection_factory,
    )
    result = await connection.discover()
    return register_discovery_result(registry=registry, result=result)


async def handle_client_message(
    message: ClientMessage,
    *,
    registry: RuntimeRegistry,
    connection_factory: ConnectionFactory | None = None,
    emit_event: EventEmitter | None = None,
) -> list[ServerMessage]:
    if isinstance(message, ConnectServerCommand):
        try:
            connection = ensure_connection(
                server_url=message.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            await connection.connect()
            server = registry.ensure_server(message.server_url)
            server.mark_connected(
                namespace_uris=server.namespace_uris,
                is_robotics_server=False,
            )
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=message.server_url,
                    message=f"Failed to connect/discover server: {exc}",
                    code="serverDiscoveryFailed",
                )
            ]

        return [
            ServerConnectedEvent(
                type="serverConnected",
                request_id=message.request_id,
                server=server.to_info(),
            )
        ]

    if isinstance(message, DiscoverRobotsCommand):
        try:
            _connected_event, robots_event = await discover_and_register(
                server_url=message.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=message.server_url,
                    message=f"Failed to discover robots: {exc}",
                    code="robotDiscoveryFailed",
                )
            ]

        robots_event.request_id = message.request_id
        return [robots_event]

    if isinstance(message, DisconnectServerCommand):
        await registry.disconnect_and_remove_server(message.server_url)
        return [
            ServerDisconnectedEvent(
                type="serverDisconnected",
                request_id=message.request_id,
                server_url=message.server_url,
            )
        ]

    if isinstance(message, BrowseAddressSpaceRootCommand):
        try:
            connection = ensure_connection(
                server_url=message.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            nodes = await connection.browse_address_space_root()
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=message.server_url,
                    message=f"Failed to browse address space root: {exc}",
                    code="addressSpaceBrowseFailed",
                )
            ]

        return [
            AddressSpaceRootEvent(
                type="addressSpaceRoot",
                request_id=message.request_id,
                server_url=message.server_url,
                nodes=nodes,
            )
        ]

    if isinstance(message, BrowseAddressSpaceChildrenCommand):
        try:
            connection = ensure_connection(
                server_url=message.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            nodes = await connection.browse_address_space_children(message.node_id)
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=message.server_url,
                    message=f"Failed to browse address space children for {message.node_id}: {exc}",
                    code="addressSpaceBrowseFailed",
                )
            ]

        return [
            AddressSpaceChildrenEvent(
                type="addressSpaceChildren",
                request_id=message.request_id,
                server_url=message.server_url,
                node_id=message.node_id,
                nodes=nodes,
            )
        ]

    if isinstance(message, BrowseAddressSpaceReferencesCommand):
        try:
            connection = ensure_connection(
                server_url=message.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            references = await connection.browse_address_space_references(message.node_id)
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=message.server_url,
                    message=f"Failed to browse address space references for {message.node_id}: {exc}",
                    code="addressSpaceBrowseFailed",
                )
            ]

        return [
            AddressSpaceReferencesEvent(
                type="addressSpaceReferences",
                request_id=message.request_id,
                server_url=message.server_url,
                node_id=message.node_id,
                references=references,
            )
        ]

    if isinstance(message, BrowseAddressSpaceNodeDetailsCommand):
        try:
            connection = ensure_connection(
                server_url=message.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            details = await connection.browse_address_space_node_details(message.node_id)
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=message.server_url,
                    message=f"Failed to browse address space node details for {message.node_id}: {exc}",
                    code="addressSpaceBrowseFailed",
                )
            ]

        return [
            AddressSpaceNodeDetailsEvent(
                type="addressSpaceNodeDetails",
                request_id=message.request_id,
                server_url=message.server_url,
                node_id=message.node_id,
                details=details,
            )
        ]

    if isinstance(message, SubscribeRobotJointsCommand):
        robot = registry.get_robot(message.robot_id)
        if robot is None:
            return [
                error_event(
                    request_id=message.request_id,
                    robot_id=message.robot_id,
                    message=f"No robot found for robotId {message.robot_id}",
                    code="robotNotFound",
                )
            ]

        robot.joints_subscription_active = True
        try:
            connection = ensure_connection(
                server_url=robot.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            joint_state = await connection.read_robot_joint_state(robot.info.opcua)
            if emit_event is not None:
                async def emit_joint_state(update: RobotJointState) -> None:
                    robot.update_joint_state(update)
                    await emit_event(
                        RobotJointStateEvent(
                            type="robotJointState",
                            server_url=robot.server_url,
                            robot_id=robot.robot_id,
                            data=update,
                        )
                    )

                await connection.subscribe_robot_joints(
                    robot_id=robot.robot_id,
                    robot_opcua=robot.info.opcua,
                    on_state=emit_joint_state,
                )
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=robot.server_url,
                    robot_id=robot.robot_id,
                    message=f"Failed to read robot joint state: {exc}",
                    code="jointReadFailed",
                )
            ]

        robot.update_joint_state(joint_state)
        return [
            MethodResultEvent(
                type="methodResult",
                request_id=message.request_id,
                server_url=robot.server_url,
                robot_id=robot.robot_id,
                result={"subscription": "robotJoints", "active": True, "mode": "snapshot"},
            ),
            RobotJointStateEvent(
                type="robotJointState",
                server_url=robot.server_url,
                robot_id=robot.robot_id,
                data=joint_state,
            ),
        ]

    if isinstance(message, UnsubscribeRobotJointsCommand):
        robot = registry.get_robot(message.robot_id)
        if robot is None:
            return [
                error_event(
                    request_id=message.request_id,
                    robot_id=message.robot_id,
                    message=f"No robot found for robotId {message.robot_id}",
                    code="robotNotFound",
                )
            ]

        robot.joints_subscription_active = False
        try:
            connection = ensure_connection(
                server_url=robot.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            await connection.unsubscribe_robot_joints(robot.robot_id)
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=robot.server_url,
                    robot_id=robot.robot_id,
                    message=f"Failed to unsubscribe robot joint state: {exc}",
                    code="jointUnsubscribeFailed",
                )
            ]

        return [
            MethodResultEvent(
                type="methodResult",
                request_id=message.request_id,
                server_url=robot.server_url,
                robot_id=robot.robot_id,
                result={"subscription": "robotJoints", "active": False},
            )
        ]

    if isinstance(message, SubscribeNodeCommand):
        try:
            connection = ensure_connection(
                server_url=message.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            if emit_event is not None:
                async def emit_node_value(value: object) -> None:
                    await emit_event(
                        NodeValueChangedEvent(
                            type="nodeValueChanged",
                            server_url=message.server_url,
                            node_id=message.node_id,
                            value=value,
                        )
                    )

                await connection.subscribe_node(node_id=message.node_id, on_value=emit_node_value)
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=message.server_url,
                    message=f"Failed to subscribe node {message.node_id}: {exc}",
                    code="nodeSubscribeFailed",
                )
            ]

        return [
            MethodResultEvent(
                type="methodResult",
                request_id=message.request_id,
                server_url=message.server_url,
                node_id=message.node_id,
                result={"subscription": "node", "active": True},
            )
        ]

    if isinstance(message, UnsubscribeNodeCommand):
        try:
            connection = ensure_connection(
                server_url=message.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            await connection.unsubscribe_node(message.node_id)
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=message.server_url,
                    message=f"Failed to unsubscribe node {message.node_id}: {exc}",
                    code="nodeUnsubscribeFailed",
                )
            ]

        return [
            MethodResultEvent(
                type="methodResult",
                request_id=message.request_id,
                server_url=message.server_url,
                node_id=message.node_id,
                result={"subscription": "node", "active": False},
            )
        ]

    if isinstance(message, SubscribeEventCommand):
        try:
            connection = ensure_connection(
                server_url=message.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            if emit_event is not None:
                async def emit_opcua_event(event: object) -> None:
                    await emit_event(
                        OpcUaEventNotificationEvent(
                            type="opcuaEvent",
                            server_url=message.server_url,
                            node_id=message.node_id,
                            event=event,
                        )
                    )

                await connection.subscribe_events(node_id=message.node_id, on_event=emit_opcua_event)
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=message.server_url,
                    message=f"Failed to subscribe events on {message.node_id}: {exc}",
                    code="eventSubscribeFailed",
                )
            ]

        return [
            MethodResultEvent(
                type="methodResult",
                request_id=message.request_id,
                server_url=message.server_url,
                node_id=message.node_id,
                result={"subscription": "event", "active": True},
            )
        ]

    if isinstance(message, UnsubscribeEventCommand):
        try:
            connection = ensure_connection(
                server_url=message.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            await connection.unsubscribe_events(message.node_id)
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=message.server_url,
                    message=f"Failed to unsubscribe events on {message.node_id}: {exc}",
                    code="eventUnsubscribeFailed",
                )
            ]

        return [
            MethodResultEvent(
                type="methodResult",
                request_id=message.request_id,
                server_url=message.server_url,
                node_id=message.node_id,
                result={"subscription": "event", "active": False},
            )
        ]

    if isinstance(message, SubscribeRobotModeCommand):
        robot = registry.get_robot(message.robot_id)
        if robot is None:
            return [
                error_event(
                    request_id=message.request_id,
                    robot_id=message.robot_id,
                    message=f"No robot found for robotId {message.robot_id}",
                    code="robotNotFound",
                )
            ]
        try:
            connection = ensure_connection(
                server_url=robot.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            if emit_event is not None:
                async def emit_robot_mode(mode: str) -> None:
                    await emit_event(
                        RobotModeChangedEvent(
                            type="robotModeChanged",
                            server_url=robot.server_url,
                            robot_id=robot.robot_id,
                            mode=mode,
                        )
                    )

                await connection.subscribe_robot_mode(
                    robot_id=robot.robot_id,
                    robot_opcua=robot.info.opcua,
                    on_mode=emit_robot_mode,
                )
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=robot.server_url,
                    robot_id=robot.robot_id,
                    message=f"Failed to subscribe robot mode: {exc}",
                    code="modeSubscribeFailed",
                )
            ]

        return [
            MethodResultEvent(
                type="methodResult",
                request_id=message.request_id,
                server_url=robot.server_url,
                robot_id=robot.robot_id,
                result={"subscription": "robotMode", "active": True},
            )
        ]

    if isinstance(message, UnsubscribeRobotModeCommand):
        robot = registry.get_robot(message.robot_id)
        if robot is None:
            return [
                error_event(
                    request_id=message.request_id,
                    robot_id=message.robot_id,
                    message=f"No robot found for robotId {message.robot_id}",
                    code="robotNotFound",
                )
            ]
        try:
            connection = ensure_connection(
                server_url=robot.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            await connection.unsubscribe_robot_mode(robot.robot_id)
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=robot.server_url,
                    robot_id=robot.robot_id,
                    message=f"Failed to unsubscribe robot mode: {exc}",
                    code="modeUnsubscribeFailed",
                )
            ]

        return [
            MethodResultEvent(
                type="methodResult",
                request_id=message.request_id,
                server_url=robot.server_url,
                robot_id=robot.robot_id,
                result={"subscription": "robotMode", "active": False},
            )
        ]

    if isinstance(message, CallRobotMethodCommand):
        robot = registry.get_robot(message.robot_id)
        if robot is None:
            return [
                error_event(
                    request_id=message.request_id,
                    robot_id=message.robot_id,
                    message=f"No robot found for robotId {message.robot_id}",
                    code="robotNotFound",
                )
            ]

        method_binding = robot.info.opcua.methods.get(message.method)
        if method_binding is None:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=robot.server_url,
                    robot_id=robot.robot_id,
                    message=f"Robot {robot.robot_id} has no method binding for {message.method!r}",
                    code="methodNotFound",
                )
            ]
        method_node_id = method_binding.node_id

        try:
            connection = ensure_connection(
                server_url=robot.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            result = await connection.call_robot_method(
                motion_device_node_id=robot.info.motion_device.node_id,
                method_name=message.method,
                method_node_id=method_node_id,
                inputs=message.inputs,
                input_arguments=method_binding.input_arguments,
            )
        except MethodInputError as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=robot.server_url,
                    robot_id=robot.robot_id,
                    message=str(exc),
                    code="invalidMethodInputs",
                )
            ]
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=robot.server_url,
                    robot_id=robot.robot_id,
                    message=f"Failed to call robot method {message.method!r}: {exc}",
                    code="methodCallFailed",
                )
            ]

        return [
            MethodResultEvent(
                type="methodResult",
                request_id=message.request_id,
                server_url=robot.server_url,
                robot_id=robot.robot_id,
                node_id=method_node_id,
                result=result,
            )
        ]

    if isinstance(message, CallRawMethodCommand):
        try:
            connection = ensure_connection(
                server_url=message.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            result = await connection.call_raw_method(
                method_node_id=message.node_id,
                inputs=message.inputs,
            )
        except MethodInputError as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=message.server_url,
                    message=str(exc),
                    code="invalidMethodInputs",
                )
            ]
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=message.server_url,
                    message=f"Failed to call raw method {message.node_id}: {exc}",
                    code="rawMethodCallFailed",
                )
            ]

        return [
            MethodResultEvent(
                type="methodResult",
                request_id=message.request_id,
                server_url=message.server_url,
                node_id=message.node_id,
                result=result,
            )
        ]

    return [
        error_event(
            message=f"Unsupported message type {message.type!r}",
            code="unsupportedMessage",
        )
    ]
