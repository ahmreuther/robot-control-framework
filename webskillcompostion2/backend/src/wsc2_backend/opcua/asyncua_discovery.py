from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from asyncua import Client, ua
from asyncua.common.node import Node

from wsc2_backend.models.opcua import AxisBinding, MethodArgument, MethodBinding, MotionDeviceBinding
from wsc2_backend.models.robot import RobotInfo, RobotJointState, RobotOpcUaInterface
from wsc2_backend.models.server import ServerSessionInfo, ServerStatus

from .discovery import MotionDeviceDescriptor, ServerDiscoveryResult, build_robot_session_infos

ROBOTICS_NAMESPACE_URI = "http://opcfoundation.org/UA/Robotics/"
DEVICE_INTEGRATION_NAMESPACE_URI = "http://opcfoundation.org/UA/DI/"

MOTION_DEVICE_TYPE_IDENTIFIER = 1004
AXIS_TYPE_IDENTIFIER = 16601


async def read_namespace_uris(client: Client) -> list[str]:
    namespace_node = client.get_node(ua.ObjectIds.Server_NamespaceArray)
    value = await namespace_node.read_value()
    return [str(uri) for uri in value]


def namespace_index(namespace_uris: list[str], namespace_uri: str) -> int | None:
    try:
        return namespace_uris.index(namespace_uri)
    except ValueError:
        return None


def typed_node_id(namespace_uris: list[str], namespace_uri: str, identifier: int) -> str | None:
    index = namespace_index(namespace_uris, namespace_uri)
    if index is None:
        return None
    return f"ns={index};i={identifier}"


async def read_display_name(node: Node) -> str:
    display_name = await node.read_display_name()
    return getattr(display_name, "Text", str(display_name))


async def read_browse_name(node: Node) -> str:
    browse_name = await node.read_browse_name()
    return getattr(browse_name, "Name", str(browse_name))


async def read_type_definition_id(node: Node) -> str | None:
    try:
        return (await node.read_type_definition()).to_string()
    except Exception:
        return None


async def read_node_class_name(node: Node) -> str | None:
    try:
        return (await node.read_node_class()).name
    except Exception:
        return None


async def iter_descendants(start_node: Node) -> AsyncIterator[Node]:
    queue = [start_node]
    visited: set[str] = set()

    while queue:
        node = queue.pop(0)
        node_id = node.nodeid.to_string()
        if node_id in visited:
            continue
        visited.add(node_id)
        yield node

        try:
            queue.extend(await node.get_children())
        except Exception:
            continue


async def child_by_name(node: Node | None, wanted: str) -> Node | None:
    if node is None:
        return None

    wanted_normalized = wanted.lower()
    try:
        children = await node.get_children()
    except Exception:
        return None

    for child in children:
        names: list[str] = []
        try:
            names.append((await read_display_name(child)).lower())
        except Exception:
            pass
        try:
            names.append((await read_browse_name(child)).lower())
        except Exception:
            pass

        if wanted_normalized in names:
            return child

    return None


async def read_text_child(node: Node, child_name: str) -> str | None:
    child = await child_by_name(node, child_name)
    if child is None:
        return None

    try:
        value = await child.read_value()
    except Exception:
        return None

    return getattr(value, "Text", str(value))


async def find_device_set(client: Client, namespace_uris: list[str]) -> Node | None:
    di_index = namespace_index(namespace_uris, DEVICE_INTEGRATION_NAMESPACE_URI)
    candidate_paths = [["0:Objects"]]
    if di_index is not None:
        candidate_paths.append(["0:Objects", f"{di_index}:DeviceSet"])

    for path in reversed(candidate_paths):
        try:
            node = await client.nodes.root.get_child(path)
        except Exception:
            continue

        if path[-1].endswith(":DeviceSet"):
            return node

        device_set = await child_by_name(node, "DeviceSet")
        if device_set is not None:
            return device_set

    return None


async def discover_motion_device_nodes(
    *,
    start_node: Node,
    namespace_uris: list[str],
) -> list[Node]:
    motion_device_type_id = typed_node_id(
        namespace_uris,
        ROBOTICS_NAMESPACE_URI,
        MOTION_DEVICE_TYPE_IDENTIFIER,
    )
    if motion_device_type_id is None:
        return []

    motion_devices: list[Node] = []
    async for node in iter_descendants(start_node):
        if await read_type_definition_id(node) == motion_device_type_id:
            motion_devices.append(node)

    return motion_devices


async def discover_axis_bindings(
    *,
    motion_device_node: Node,
    namespace_uris: list[str],
) -> dict[str, AxisBinding]:
    axis_type_id = typed_node_id(namespace_uris, ROBOTICS_NAMESPACE_URI, AXIS_TYPE_IDENTIFIER)
    axes_node = await child_by_name(motion_device_node, "Axes")
    if axes_node is None:
        return {}

    axes: dict[str, AxisBinding] = {}
    for axis_node in await axes_node.get_children():
        if axis_type_id is not None and await read_type_definition_id(axis_node) != axis_type_id:
            continue

        axis_name = await read_display_name(axis_node)
        parameter_set = await child_by_name(axis_node, "ParameterSet")
        actual_position = await child_by_name(parameter_set, "ActualPosition")
        engineering_units = await child_by_name(actual_position, "EngineeringUnits")

        axes[axis_name] = AxisBinding(
            axis_name=axis_name,
            axis_node_id=axis_node.nodeid.to_string(),
            actual_position_node_id=actual_position.nodeid.to_string()
            if actual_position is not None
            else None,
            engineering_units_node_id=engineering_units.nodeid.to_string()
            if engineering_units is not None
            else None,
        )

    return axes


async def read_method_arguments(method_node: Node, argument_node_name: str) -> list[MethodArgument]:
    argument_node = await child_by_name(method_node, argument_node_name)
    if argument_node is None:
        return []

    try:
        arguments = await argument_node.read_value()
    except Exception:
        return []

    result: list[MethodArgument] = []
    for argument in arguments or []:
        description = getattr(argument, "Description", None)
        result.append(
            MethodArgument(
                name=getattr(argument, "Name", None),
                data_type_node_id=getattr(argument, "DataType", None).to_string()
                if getattr(argument, "DataType", None) is not None
                else None,
                value_rank=getattr(argument, "ValueRank", None),
                array_dimensions=list(getattr(argument, "ArrayDimensions", []) or []),
                description=getattr(description, "Text", None)
                if description is not None
                else None,
            )
        )

    return result


async def build_method_binding(method_node: Node) -> MethodBinding:
    return MethodBinding(
        node_id=method_node.nodeid.to_string(),
        display_name=await read_display_name(method_node),
        browse_name=await read_browse_name(method_node),
        node_class=await read_node_class_name(method_node),
        input_arguments=await read_method_arguments(method_node, "InputArguments"),
        output_arguments=await read_method_arguments(method_node, "OutputArguments"),
    )


async def discover_method_bindings(motion_device_node: Node) -> dict[str, MethodBinding]:
    methods: dict[str, MethodBinding] = {}

    async for node in iter_descendants(motion_device_node):
        try:
            node_class = await node.read_node_class()
        except Exception:
            continue
        if node_class != ua.NodeClass.Method:
            continue

        display = (await read_display_name(node)).lower()
        browse = (await read_browse_name(node)).lower()
        names = f"{display} {browse}"

        binding = await build_method_binding(node)
        if any(token in names for token in ["jointptp", "linmove", "goto", "go to", "move"]):
            methods.setdefault("goto", binding)
        if any(token in names for token in ["endeff", "end_eff", "endeffector", "gripper"]):
            methods.setdefault("toggleEndEffector", binding)

    return methods


async def discover_variable_bindings(motion_device_node: Node) -> dict[str, str]:
    variables: dict[str, str] = {}

    async for node in iter_descendants(motion_device_node):
        try:
            node_class = await node.read_node_class()
        except Exception:
            continue
        if node_class != ua.NodeClass.Variable:
            continue

        display = (await read_display_name(node)).lower()
        browse = (await read_browse_name(node)).lower()
        names = f"{display} {browse}"

        if any(token in names for token in ["mode", "robotstate", "robot state"]):
            variables.setdefault("mode", node.nodeid.to_string())

    return variables


async def discover_motion_device_descriptors(
    *,
    client: Client,
    namespace_uris: list[str],
) -> list[MotionDeviceDescriptor]:
    device_set = await find_device_set(client, namespace_uris)
    if device_set is None:
        return []

    motion_device_nodes = await discover_motion_device_nodes(
        start_node=device_set,
        namespace_uris=namespace_uris,
    )
    robotics_namespace_index = namespace_index(namespace_uris, ROBOTICS_NAMESPACE_URI)

    descriptors: list[MotionDeviceDescriptor] = []
    for motion_device_node in motion_device_nodes:
        info = RobotInfo(
            manufacturer=await read_text_child(motion_device_node, "Manufacturer"),
            model=await read_text_child(motion_device_node, "Model"),
            serial_number=await read_text_child(motion_device_node, "SerialNumber"),
        )
        opcua = RobotOpcUaInterface(
            variables=await discover_variable_bindings(motion_device_node),
            axes=await discover_axis_bindings(
                motion_device_node=motion_device_node,
                namespace_uris=namespace_uris,
            ),
            methods=await discover_method_bindings(motion_device_node),
        )

        descriptors.append(
            MotionDeviceDescriptor(
                motion_device=MotionDeviceBinding(
                    node_id=motion_device_node.nodeid.to_string(),
                    display_name=await read_display_name(motion_device_node),
                    browse_name=await read_browse_name(motion_device_node),
                    type_definition_node_id=await read_type_definition_id(motion_device_node),
                    namespace_uri=namespace_uris[robotics_namespace_index]
                    if robotics_namespace_index is not None
                    else None,
                ),
                info=info,
                opcua=opcua,
            )
        )

    return descriptors


async def discover_connected_server(
    *,
    server_url: str,
    client: Client,
) -> ServerDiscoveryResult:
    namespace_uris = await read_namespace_uris(client)
    descriptors = await discover_motion_device_descriptors(
        client=client,
        namespace_uris=namespace_uris,
    )
    robots = build_robot_session_infos(server_url=server_url, motion_devices=descriptors)
    server = ServerSessionInfo(
        server_url=server_url,
        status=ServerStatus.CONNECTED,
        namespace_uris=namespace_uris,
        is_robotics_server=ROBOTICS_NAMESPACE_URI in namespace_uris,
        robot_ids=[robot.robot_id for robot in robots],
    )
    return ServerDiscoveryResult(server=server, robots=robots)


async def discover_server(server_url: str) -> ServerDiscoveryResult:
    client = Client(server_url)
    await client.connect()
    try:
        return await discover_connected_server(server_url=server_url, client=client)
    finally:
        await client.disconnect()


async def read_connected_robot_joint_state(
    *,
    client: Client,
    robot_opcua: RobotOpcUaInterface,
) -> RobotJointState:
    axis_values: dict[str, float] = {}
    unit: str | dict[str, Any] | None = None
    for axis_name, axis in robot_opcua.axes.items():
        if axis.actual_position_node_id is None:
            continue

        value = await client.get_node(axis.actual_position_node_id).read_value()
        axis_values[axis_name] = float(value)

        if unit is None and axis.engineering_units_node_id is not None:
            try:
                unit_value = await client.get_node(axis.engineering_units_node_id).read_value()
                unit = str(unit_value)
            except Exception:
                unit = None

    return RobotJointState(axis_values=axis_values, unit=unit)


async def read_robot_joint_state(server_url: str, robot_opcua: RobotOpcUaInterface) -> RobotJointState:
    client = Client(server_url)
    await client.connect()
    try:
        return await read_connected_robot_joint_state(client=client, robot_opcua=robot_opcua)
    finally:
        await client.disconnect()
