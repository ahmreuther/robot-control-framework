from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
import logging
import re
from typing import Any

from backend.models.messages import (
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
    ExecuteRobotActionCommand,
    HaltRobotActionCommand,
    MethodResultEvent,
    ResetRobotActionCommand,
    RobotActionStateEvent,
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
from backend.models.robot import RobotActionState, RobotConnectionStatus, RobotJointState
from backend.opcua.method_calls import MethodInputError
from backend.opcua.server_connection import AsyncUaServerConnection
from backend.opcua.discovery import ServerDiscoveryResult
from backend.services.runtime_registry import RuntimeRegistry

from .action_execution import (
    RobotActionExecutionError,
    execute_robot_action,
    transition_robot_action,
)
from .robot_session import RobotSession

logger = logging.getLogger(__name__)

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

    for robot in robot_sessions:
        logger.info(
            "discovered robot %s (%s): actions=%s skills=%s methods=%s actionNames=%s skillNames=%s methodNames=%s",
            robot.info.display_name,
            robot.info.robot_id,
            len(robot.info.actions),
            len(robot.info.opcua.skills),
            len(robot.info.opcua.methods),
            sorted(robot.info.actions.keys()),
            sorted(robot.info.opcua.skills.keys()),
            sorted(robot.info.opcua.methods.keys()),
        )

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


def _map_skill_current_state_to_status(current_state: str | None) -> str:
    normalized = (current_state or "").strip().lower()
    if re.search(r"\b(ready|idle)\b", normalized):
        return "idle"
    if re.search(r"\b(halted|aborted|stopped)\b", normalized):
        return "halted"
    if re.search(r"\b(reset|resetting)\b", normalized):
        return "reset"
    if re.search(r"\b(failed|error)\b", normalized):
        return "failed"
    return "running"


def _extract_skill_current_state_text(raw_value: Any) -> str | None:
    if raw_value is None:
        return None
    if isinstance(raw_value, dict):
        for key in ("Text", "text", "Name", "name"):
            value = raw_value.get(key)
            if value:
                return str(value)
        return str(raw_value)
    return str(raw_value)


async def _watch_skill_action_state(
    *,
    robot: RobotSession,
    action_name: str,
    connection: AsyncUaServerConnection,
    emit_event: EventEmitter,
    poll_interval_s: float = 0.25,
) -> None:
    action = robot.info.actions.get(action_name)
    if action is None or action.current_state_node_id is None:
        return

    last_current_state: str | None = None
    try:
        while True:
            raw_value = await connection.read_node_value(action.current_state_node_id)
            current_state = _extract_skill_current_state_text(raw_value)
            if current_state != last_current_state:
                state = RobotActionState(
                    action_name=action_name,
                    kind=action.kind,
                    status=_map_skill_current_state_to_status(current_state),
                    current_state=current_state,
                )
                robot.update_action_state(state)
                await emit_event(
                    RobotActionStateEvent(
                        type="robotActionState",
                        server_url=robot.server_url,
                        robot_id=robot.robot_id,
                        data=state,
                    )
                )
                last_current_state = current_state

            if _map_skill_current_state_to_status(current_state) == "idle":
                break

            await asyncio.sleep(poll_interval_s)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning(
            "action state watch failed for %s (%s) action %s: %s",
            robot.info.display_name,
            robot.robot_id,
            action_name,
            exc,
        )
    finally:
        robot.action_watch_tasks.pop(action_name, None)


async def discover_and_register(
    *,
    server_url: str,
    registry: RuntimeRegistry,
    connection_factory: ConnectionFactory | None = None,
    use_cache: bool = True,
) -> tuple[ServerConnectedEvent, RobotsDiscoveredEvent]:
    if use_cache:
        cached_result = registry.get_cached_discovery(server_url)
        if cached_result is not None:
            logger.info("using cached discovery result for %s", server_url)
            return register_discovery_result(registry=registry, result=cached_result)

    connection = ensure_connection(
        server_url=server_url,
        registry=registry,
        connection_factory=connection_factory,
    )
    result = await connection.discover()
    registry.cache_discovery_result(result)
    logger.info("cached discovery result for %s", server_url)
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

    if isinstance(message, ExecuteRobotActionCommand):
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
            executed = await execute_robot_action(
                robot=robot,
                action_name=message.action_name,
                inputs=message.inputs,
                connection=connection,
            )
        except MethodInputError as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=robot.server_url,
                    robot_id=robot.robot_id,
                    message=str(exc),
                    code="invalidActionInputs",
                )
            ]
        except RobotActionExecutionError as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=robot.server_url,
                    robot_id=robot.robot_id,
                    message=str(exc),
                    code="actionExecutionFailed",
                )
            ]
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=robot.server_url,
                    robot_id=robot.robot_id,
                    message=f"Failed to execute robot action {message.action_name!r}: {exc}",
                    code="actionExecutionFailed",
                )
            ]

        robot.update_action_state(executed.state)
        action = robot.info.actions.get(message.action_name)
        if (
            emit_event is not None
            and action is not None
            and action.kind == "skill"
            and action.current_state_node_id is not None
        ):
            robot.replace_action_watch_task(
                message.action_name,
                asyncio.create_task(
                    _watch_skill_action_state(
                        robot=robot,
                        action_name=message.action_name,
                        connection=connection,
                        emit_event=emit_event,
                    )
                ),
            )
        return [
            MethodResultEvent(
                type="methodResult",
                request_id=message.request_id,
                server_url=robot.server_url,
                robot_id=robot.robot_id,
                node_id=executed.node_id,
                result=executed.result,
            ),
            RobotActionStateEvent(
                type="robotActionState",
                request_id=message.request_id,
                server_url=robot.server_url,
                robot_id=robot.robot_id,
                data=executed.state,
            ),
        ]

    if isinstance(message, HaltRobotActionCommand) or isinstance(message, ResetRobotActionCommand):
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

        transition = "halt" if isinstance(message, HaltRobotActionCommand) else "reset"
        robot.clear_action_watch_task(message.action_name)
        try:
            connection = ensure_connection(
                server_url=robot.server_url,
                registry=registry,
                connection_factory=connection_factory,
            )
            executed = await transition_robot_action(
                robot=robot,
                action_name=message.action_name,
                transition=transition,
                connection=connection,
            )
        except RobotActionExecutionError as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=robot.server_url,
                    robot_id=robot.robot_id,
                    message=str(exc),
                    code="actionExecutionFailed",
                )
            ]
        except Exception as exc:
            return [
                error_event(
                    request_id=message.request_id,
                    server_url=robot.server_url,
                    robot_id=robot.robot_id,
                    message=f"Failed to {transition} robot action {message.action_name!r}: {exc}",
                    code="actionExecutionFailed",
                )
            ]

        robot.update_action_state(executed.state)
        return [
            MethodResultEvent(
                type="methodResult",
                request_id=message.request_id,
                server_url=robot.server_url,
                robot_id=robot.robot_id,
                node_id=executed.node_id,
                result=executed.result,
            ),
            RobotActionStateEvent(
                type="robotActionState",
                request_id=message.request_id,
                server_url=robot.server_url,
                robot_id=robot.robot_id,
                data=executed.state,
            ),
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
