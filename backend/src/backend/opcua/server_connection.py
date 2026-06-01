from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from asyncua import Client

from backend.models.address_space import (
    AddressSpaceNode,
    AddressSpaceNodeDetails,
    AddressSpaceReference,
)
from backend.models.opcua import MethodArgument
from backend.models.robot import RobotJointState, RobotOpcUaInterface

from .asyncua_discovery import (
    discover_connected_server,
    read_connected_robot_joint_state,
    read_method_arguments,
)
from .discovery import ServerDiscoveryResult
from .method_calls import call_raw_method, call_robot_method, to_jsonable

JointStateCallback = Callable[[RobotJointState], Awaitable[None]]
NodeValueCallback = Callable[[object], Awaitable[None]]
EventCallback = Callable[[object], Awaitable[None]]


def _coerce_scalar_like_existing(value: object, existing: object) -> object:
    if isinstance(existing, bool):
        return bool(value)
    if isinstance(existing, float):
        return float(value)
    if isinstance(existing, int) and not isinstance(existing, bool):
        return int(value)
    if isinstance(existing, str):
        return str(value)
    return value


def _coerce_value_like_existing(value: object, existing: object) -> object:
    if existing is None:
        return value

    if isinstance(existing, list):
        if not isinstance(value, list):
            return value
        if not existing:
            if all(isinstance(item, (int, float)) for item in value):
                return [float(item) for item in value]
            return value
        exemplar = next((item for item in existing if item is not None), None)
        if exemplar is None:
            return value
        return [_coerce_scalar_like_existing(item, exemplar) for item in value]

    return _coerce_scalar_like_existing(value, existing)


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

        if value is None:
            return

        try:
            self.axis_values[axis_name] = float(value)
        except (TypeError, ValueError):
            return

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

    async def read_node_value(self, node_id: str) -> object:
        await self.connect()
        node = self.client.get_node(node_id)
        return to_jsonable(await node.read_value())

    async def write_node_value(
        self,
        node_id: str,
        value: object,
        *,
        coerce_to_existing: bool = False,
    ) -> None:
        await self.connect()
        node = self.client.get_node(node_id)
        if coerce_to_existing:
            existing_value = await node.read_value()
            value = _coerce_value_like_existing(value, existing_value)
        await node.write_value(value)

    async def browse_address_space_root(self) -> list[AddressSpaceNode]:
        await self.connect()
        return [await self._read_address_space_node(self.client.nodes.root)]

    async def browse_address_space_children(self, node_id: str) -> list[AddressSpaceNode]:
        await self.connect()
        return await self._browse_children_of(self.client.get_node(node_id))

    async def browse_address_space_references(
        self,
        node_id: str,
    ) -> list[AddressSpaceReference]:
        await self.connect()
        node = self.client.get_node(node_id)
        references = await node.get_references()
        if references:
            references = references[1:]
        result: list[AddressSpaceReference] = []
        for reference in references:
            browse_name = self._reference_browse_name(reference)
            node_identifier = getattr(reference, "NodeId", None)
            node_id_text = (
                node_identifier.to_string()
                if node_identifier is not None and hasattr(node_identifier, "to_string")
                else str(node_identifier)
            )
            reference_type_id = getattr(reference, "ReferenceTypeId", None)
            type_definition_id = getattr(reference, "TypeDefinition", None)
            reference_type_name = await self._safe_node_display_name(reference_type_id)
            type_definition_name = (
                await self._safe_node_display_name(type_definition_id)
                if type_definition_id is not None and getattr(type_definition_id, "Identifier", 0) != 0
                else "Null"
            )
            result.append(
                AddressSpaceReference(
                    reference_type=f"{reference_type_name} ({reference_type_id.to_string()})",
                    node_id=node_id_text,
                    browse_name=browse_name,
                    type_definition=(
                        f"{type_definition_name} ({type_definition_id.to_string()})"
                        if type_definition_name != "Null" and type_definition_id is not None
                        else "Null"
                    ),
                )
            )
        return result

    async def browse_address_space_node_details(
        self,
        node_id: str,
    ) -> AddressSpaceNodeDetails:
        await self.connect()
        node = self.client.get_node(node_id)
        display_name = await self._safe_read(node.read_display_name)
        browse_name = await self._safe_read(node.read_browse_name)
        node_class = await self._safe_read(node.read_node_class)
        description = await self._safe_read(node.read_description)
        value = await self._safe_read(node.read_value)
        data_type = await self._safe_read(self._read_node_data_type_name, node)
        event_notifier = await self._safe_read(node.read_event_notifier)

        node_class_name = getattr(node_class, "name", str(node_class)) if node_class is not None else None
        node_class_value = getattr(node_class, "value", None) if node_class is not None else None
        input_arguments = (
            await read_method_arguments(node, "InputArguments")
            if node_class_name == "Method"
            else []
        )
        output_arguments = (
            await read_method_arguments(node, "OutputArguments")
            if node_class_name == "Method"
            else []
        )
        return AddressSpaceNodeDetails(
            node_id=node.nodeid.to_string(),
            browse_name=self._browse_name_text(browse_name),
            display_name=self._localized_text(display_name),
            node_class=node_class_name,
            node_class_value=node_class_value,
            description=self._localized_text(description),
            value=to_jsonable(value) if value is not None else None,
            data_type=data_type,
            event_notifier=str(event_notifier) if event_notifier is not None else None,
            input_arguments=input_arguments,
            output_arguments=output_arguments,
        )

    async def _browse_children_of(self, node: Any) -> list[AddressSpaceNode]:
        children = await node.get_children()
        result: list[AddressSpaceNode] = []
        for child in children:
            result.append(await self._read_address_space_node(child))
        return result

    async def _read_address_space_node(self, node: Any) -> AddressSpaceNode:
        display_name = await node.read_display_name()
        browse_name = await node.read_browse_name()
        node_class = await node.read_node_class()
        children = await node.get_children()
        return AddressSpaceNode(
            node_id=node.nodeid.to_string(),
            display_name=getattr(display_name, "Text", str(display_name)),
            browse_name=getattr(browse_name, "Name", str(browse_name)),
            node_class=getattr(node_class, "name", str(node_class)),
            has_children=len(children) > 0,
        )

    async def _read_node_data_type_name(self, node: Any) -> str | None:
        variant_type = await self._safe_read(node.read_data_type_as_variant_type)
        if variant_type is not None:
            return getattr(variant_type, "name", None) or str(variant_type)

        data_type = await self._safe_read(node.read_data_type)
        if data_type is None:
            return None
        display_name = await self._safe_node_display_name(data_type)
        if display_name and display_name != "null":
            return display_name
        to_string = getattr(data_type, "to_string", None)
        if callable(to_string):
            return to_string()
        return str(data_type)

    async def _safe_read(self, reader: Callable[..., Awaitable[Any]], *args: Any) -> Any | None:
        try:
            return await reader(*args)
        except Exception:
            return None

    def _localized_text(self, value: Any) -> str | None:
        if value is None:
            return None
        text = getattr(value, "Text", None)
        if text is not None:
            text = str(text).strip()
            return text or None
        text = str(value).strip()
        return text or None

    def _browse_name_text(self, value: Any) -> str | None:
        if value is None:
            return None
        to_string = getattr(value, "to_string", None)
        if callable(to_string):
            return to_string()
        name = getattr(value, "Name", None)
        if name is not None:
            namespace_index = getattr(value, "NamespaceIndex", None)
            if namespace_index is not None:
                return f"{namespace_index}:{name}"
            return str(name)
        text = str(value).strip()
        return text or None

    async def _safe_node_display_name(self, node_id: Any) -> str:
        if node_id is None:
            return "null"
        try:
            node = self.client.get_node(node_id)
            display_name = await node.read_display_name()
            text = getattr(display_name, "Text", "") or ""
            text = text.strip()
            return text if text else "null"
        except Exception:
            return "null"

    def _reference_browse_name(self, reference: Any) -> str | None:
        browse_name = getattr(reference, "BrowseName", None)
        if browse_name is None:
            return None
        to_string = getattr(browse_name, "to_string", None)
        if callable(to_string):
            return to_string()
        return getattr(browse_name, "Name", None) or str(browse_name)
