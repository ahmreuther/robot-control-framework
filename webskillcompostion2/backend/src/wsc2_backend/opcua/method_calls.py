from __future__ import annotations

from typing import Any

from asyncua import Client

from wsc2_backend.models.opcua import MethodArgument


class MethodInputError(ValueError):
    """Raised when frontend JSON cannot be converted into ordered OPC UA args."""


def normalize_method_inputs(inputs: dict[str, Any]) -> list[Any]:
    """Convert method input JSON into the ordered argument list asyncua expects."""

    if "args" in inputs:
        args = inputs["args"]
    elif "arguments" in inputs:
        args = inputs["arguments"]
    elif not inputs:
        return []
    elif set(inputs) == {"value"}:
        return [inputs["value"]]
    elif set(inputs) == {"joints"}:
        return [inputs["joints"]]
    else:
        raise MethodInputError(
            "Method inputs must use an ordered 'args' list, or one supported single-value key."
        )

    if not isinstance(args, list):
        raise MethodInputError("Method input 'args' must be a list.")
    return args


def validate_method_args(
    *,
    method_name: str,
    args: list[Any],
    input_arguments: list[MethodArgument],
) -> None:
    if not input_arguments:
        return
    if len(args) != len(input_arguments):
        expected = ", ".join(argument.name or f"arg{index}" for index, argument in enumerate(input_arguments))
        raise MethodInputError(
            f"Method {method_name!r} expects {len(input_arguments)} argument(s): {expected}."
        )


def to_jsonable(value: Any) -> Any:
    """Best-effort conversion of asyncua return values into JSON-safe data."""

    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, list | tuple):
        return [to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): to_jsonable(item) for key, item in value.items()}
    if hasattr(value, "to_string"):
        return value.to_string()
    if hasattr(value, "Value"):
        return to_jsonable(value.Value)
    return str(value)


async def call_robot_method(
    *,
    client: Client,
    motion_device_node_id: str,
    method_name: str,
    method_node_id: str,
    inputs: dict[str, Any],
    input_arguments: list[MethodArgument] | None = None,
) -> dict[str, Any]:
    args = normalize_method_inputs(inputs)
    validate_method_args(
        method_name=method_name,
        args=args,
        input_arguments=input_arguments or [],
    )
    motion_device_node = client.get_node(motion_device_node_id)
    method_node = client.get_node(method_node_id)
    output = await motion_device_node.call_method(method_node.nodeid, *args)

    return {
        "method": method_name,
        "inputs": inputs,
        "args": args,
        "output": to_jsonable(output),
        "status": "ok",
    }


async def call_raw_method(
    *,
    client: Client,
    method_node_id: str,
    inputs: dict[str, Any],
) -> dict[str, Any]:
    args = normalize_method_inputs(inputs)
    method_node = client.get_node(method_node_id)
    parent_node = await method_node.get_parent()
    output = await parent_node.call_method(method_node.nodeid, *args)

    return {
        "methodNodeId": method_node_id,
        "inputs": inputs,
        "args": args,
        "output": to_jsonable(output),
        "status": "ok",
    }
