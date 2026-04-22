from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from asyncua import Client

from wsc2_backend.models.opcua import MethodArgument
from wsc2_backend.models.robot import RobotJointState, RobotOpcUaInterface

from .asyncua_discovery import discover_connected_server, read_connected_robot_joint_state
from .discovery import ServerDiscoveryResult
from .method_calls import call_raw_method, call_robot_method, to_jsonable

JointStateCallback = Callable[[RobotJointState], Awaitable[None]]
NodeValueCallback = Callable[[object], Awaitable[None]]
EventCallback = Callable[[object], Awaitable[None]]


@dataclass
class RobotJointSubscription:
    subscription: Any
    handles: list[Any]


class RobotJointSubscriptionHandler:
    def __init__(
        self,
        *,
        axis_names_by_node_id: dict[str, str],
        axis_values: dict[str, float],
        unit: str | dict[str, object] | None,
        on_state: JointStateCallback,
    ) -> None:
        self.axis_names_by_node_id = axis_names_by_node_id
        self.axis_values = axis_values
        self.unit = unit
        self.on_state = on_state

    async def datachange_notification(self, node: Any, value: Any, _data: Any) -> None:
        axis_name = self.axis_names_by_node_id.get(node.nodeid.to_string())
        if axis_name is None:
            return

        self.axis_values[axis_name] = float(value)
        await self.on_state(
            RobotJointState(
                axis_values=self.axis_values.copy(),
                unit=self.unit,
            )
        )


@dataclass
class DataChangeSubscription:
    subscription: Any
    handles: list[Any]


class NodeValueSubscriptionHandler:
    def __init__(self, on_value: NodeValueCallback) -> None:
        self.on_value = on_value

    async def datachange_notification(self, _node: Any, value: Any, _data: Any) -> None:
        await self.on_value(to_jsonable(value))


class EventSubscriptionHandler:
    def __init__(self, on_event: EventCallback) -> None:
        self.on_event = on_event

    async def event_notification(self, event: Any) -> None:
        await self.on_event(to_jsonable(event))


class AsyncUaServerConnection:
    """Persistent asyncua connection for one OPC UA server."""

    def __init__(self, server_url: str) -> None:
        self.server_url = server_url
        self.client = Client(server_url)
        self.connected = False
        self._joint_subscriptions: dict[str, RobotJointSubscription] = {}
        self._node_subscriptions: dict[str, DataChangeSubscription] = {}
        self._event_subscriptions: dict[str, DataChangeSubscription] = {}
        self._mode_subscriptions: dict[str, DataChangeSubscription] = {}

    async def connect(self) -> None:
        if self.connected:
            return
        await self.client.connect()
        self.connected = True

    async def disconnect(self) -> None:
        if not self.connected:
            return
        for robot_id in list(self._joint_subscriptions):
            await self.unsubscribe_robot_joints(robot_id)
        for node_id in list(self._node_subscriptions):
            await self.unsubscribe_node(node_id)
        for node_id in list(self._event_subscriptions):
            await self.unsubscribe_events(node_id)
        for robot_id in list(self._mode_subscriptions):
            await self.unsubscribe_robot_mode(robot_id)
        await self.client.disconnect()
        self.connected = False

    async def discover(self) -> ServerDiscoveryResult:
        await self.connect()
        return await discover_connected_server(server_url=self.server_url, client=self.client)

    async def read_robot_joint_state(self, robot_opcua: RobotOpcUaInterface) -> RobotJointState:
        await self.connect()
        return await read_connected_robot_joint_state(client=self.client, robot_opcua=robot_opcua)

    async def subscribe_robot_joints(
        self,
        *,
        robot_id: str,
        robot_opcua: RobotOpcUaInterface,
        on_state: JointStateCallback,
        publishing_interval_ms: float = 100.0,
    ) -> None:
        await self.connect()
        await self.unsubscribe_robot_joints(robot_id)

        node_ids_by_axis = {
            axis_name: axis.actual_position_node_id
            for axis_name, axis in robot_opcua.axes.items()
            if axis.actual_position_node_id is not None
        }
        if not node_ids_by_axis:
            raise ValueError("Robot has no ActualPosition nodes to subscribe to.")

        initial_state = await self.read_robot_joint_state(robot_opcua)
        axis_names_by_node_id = {
            node_id: axis_name for axis_name, node_id in node_ids_by_axis.items()
        }
        nodes = [self.client.get_node(node_id) for node_id in node_ids_by_axis.values()]
        handler = RobotJointSubscriptionHandler(
            axis_names_by_node_id=axis_names_by_node_id,
            axis_values=initial_state.axis_values.copy(),
            unit=initial_state.unit,
            on_state=on_state,
        )
        subscription = await self.client.create_subscription(publishing_interval_ms, handler)
        handles = await subscription.subscribe_data_change(nodes)
        if not isinstance(handles, list):
            handles = [handles]

        self._joint_subscriptions[robot_id] = RobotJointSubscription(
            subscription=subscription,
            handles=handles,
        )

    async def unsubscribe_robot_joints(self, robot_id: str) -> None:
        active = self._joint_subscriptions.pop(robot_id, None)
        if active is None:
            return
        await active.subscription.delete()

    async def subscribe_node(
        self,
        *,
        node_id: str,
        on_value: NodeValueCallback,
        publishing_interval_ms: float = 100.0,
    ) -> None:
        await self.connect()
        await self.unsubscribe_node(node_id)

        node = self.client.get_node(node_id)
        handler = NodeValueSubscriptionHandler(on_value)
        subscription = await self.client.create_subscription(publishing_interval_ms, handler)
        handles = await subscription.subscribe_data_change(node)
        if not isinstance(handles, list):
            handles = [handles]
        self._node_subscriptions[node_id] = DataChangeSubscription(subscription, handles)

    async def unsubscribe_node(self, node_id: str) -> None:
        active = self._node_subscriptions.pop(node_id, None)
        if active is None:
            return
        await active.subscription.delete()

    async def subscribe_events(
        self,
        *,
        node_id: str,
        on_event: EventCallback,
        publishing_interval_ms: float = 100.0,
    ) -> None:
        await self.connect()
        await self.unsubscribe_events(node_id)

        node = self.client.get_node(node_id)
        handler = EventSubscriptionHandler(on_event)
        subscription = await self.client.create_subscription(publishing_interval_ms, handler)
        handle = await subscription.subscribe_events(node)
        handles = handle if isinstance(handle, list) else [handle]
        self._event_subscriptions[node_id] = DataChangeSubscription(subscription, handles)

    async def unsubscribe_events(self, node_id: str) -> None:
        active = self._event_subscriptions.pop(node_id, None)
        if active is None:
            return
        await active.subscription.delete()

    async def subscribe_robot_mode(
        self,
        *,
        robot_id: str,
        robot_opcua: RobotOpcUaInterface,
        on_mode: Callable[[str], Awaitable[None]],
        publishing_interval_ms: float = 100.0,
    ) -> None:
        mode_node_id = robot_opcua.variables.get("mode") or robot_opcua.variables.get("robotMode")
        if mode_node_id is None:
            raise ValueError("Robot has no mode variable binding.")

        await self.connect()
        await self.unsubscribe_robot_mode(robot_id)
        node = self.client.get_node(mode_node_id)
        handler = NodeValueSubscriptionHandler(lambda value: on_mode(str(value)))
        subscription = await self.client.create_subscription(publishing_interval_ms, handler)
        handles = await subscription.subscribe_data_change(node)
        if not isinstance(handles, list):
            handles = [handles]
        self._mode_subscriptions[robot_id] = DataChangeSubscription(subscription, handles)

    async def unsubscribe_robot_mode(self, robot_id: str) -> None:
        active = self._mode_subscriptions.pop(robot_id, None)
        if active is None:
            return
        await active.subscription.delete()

    async def call_robot_method(
        self,
        *,
        motion_device_node_id: str,
        method_name: str,
        method_node_id: str,
        inputs: dict[str, object],
        input_arguments: list[MethodArgument] | None = None,
    ) -> dict[str, object]:
        await self.connect()
        return await call_robot_method(
            client=self.client,
            motion_device_node_id=motion_device_node_id,
            method_name=method_name,
            method_node_id=method_node_id,
            inputs=inputs,
            input_arguments=input_arguments,
        )

    async def call_raw_method(
        self,
        *,
        method_node_id: str,
        inputs: dict[str, object],
    ) -> dict[str, object]:
        await self.connect()
        return await call_raw_method(
            client=self.client,
            method_node_id=method_node_id,
            inputs=inputs,
        )
