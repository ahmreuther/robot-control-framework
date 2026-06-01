from __future__ import annotations

import base64
from datetime import datetime
from typing import Any
from uuid import UUID

from asyncua import Client
from asyncua import ua

from backend.models.opcua import MethodArgument


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


async def read_method_arguments(
    method_node: Any,
    argument_node_name: str,
) -> list[MethodArgument]:
    argument_node: Any | None = None
    try:
        argument_node = await method_node.get_child(f"0:{argument_node_name}")
    except Exception:
        argument_node = None
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


def coerce_method_args(
    args: list[Any],
    input_arguments: list[MethodArgument],
) -> list[Any]:
    if not input_arguments:
        return args

    return [
        coerce_argument_value(raw_value, argument)
        for raw_value, argument in zip(args, input_arguments, strict=True)
    ]


def coerce_argument_value(raw_value: Any, argument: MethodArgument) -> Any:
    if is_array_argument(argument):
        return coerce_array_value(raw_value, argument)
    return coerce_scalar_value(raw_value, argument)


def is_array_argument(argument: MethodArgument) -> bool:
    if argument.value_rank is None:
        return len(argument.array_dimensions) > 0
    return argument.value_rank >= 1


def coerce_array_value(raw_value: Any, argument: MethodArgument) -> list[Any]:
    if isinstance(raw_value, str):
        candidate = raw_value.strip()
        if not candidate:
          raise MethodInputError(
              format_argument_error(
                  argument,
                  "expected a JSON array value.",
              )
          )
        try:
            parsed = __import__("json").loads(candidate)
        except Exception as exc:
            raise MethodInputError(
                format_argument_error(
                    argument,
                    "expected a JSON array value.",
                )
            ) from exc
    else:
        parsed = raw_value

    if not isinstance(parsed, list):
        raise MethodInputError(
            format_argument_error(argument, "expected a JSON array value.")
        )

    scalar_argument = argument.model_copy(update={"value_rank": -1, "array_dimensions": []})
    return [coerce_scalar_value(item, scalar_argument) for item in parsed]


def coerce_scalar_value(raw_value: Any, argument: MethodArgument) -> Any:
    type_id = argument.data_type_node_id or ""

    if raw_value is None:
        return None

    if type_id in {"i=1", "ns=0;i=1"}:
        return coerce_bool(raw_value, argument)
    if type_id in {"i=2", "ns=0;i=2", "i=3", "ns=0;i=3", "i=4", "ns=0;i=4", "i=5", "ns=0;i=5",
        "i=6", "ns=0;i=6", "i=7", "ns=0;i=7", "i=8", "ns=0;i=8", "i=9", "ns=0;i=9"}:
        return coerce_int(raw_value, argument)
    if type_id in {"i=10", "ns=0;i=10", "i=11", "ns=0;i=11"}:
        return coerce_float(raw_value, argument)
    if type_id in {"i=12", "ns=0;i=12"}:
        return coerce_string(raw_value)
    if type_id in {"i=13", "ns=0;i=13"}:
        return coerce_datetime(raw_value, argument)
    if type_id in {"i=14", "ns=0;i=14"}:
        return coerce_guid(raw_value, argument)
    if type_id in {"i=15", "ns=0;i=15"}:
        return coerce_bytestring(raw_value, argument)
    if type_id in {"i=17", "ns=0;i=17"}:
        return coerce_node_id(raw_value, argument)
    if type_id in {"i=18", "ns=0;i=18"}:
        return coerce_expanded_node_id(raw_value, argument)
    if type_id in {"i=20", "ns=0;i=20"}:
        return coerce_qualified_name(raw_value, argument)
    if type_id in {"i=21", "ns=0;i=21"}:
        return coerce_localized_text(raw_value, argument)

    if isinstance(raw_value, str):
        stripped = raw_value.strip()
        if not stripped:
            return ""
        try:
            return __import__("json").loads(stripped)
        except Exception:
            return raw_value
    return raw_value


def coerce_bool(raw_value: Any, argument: MethodArgument) -> bool:
    if isinstance(raw_value, bool):
        return raw_value
    if isinstance(raw_value, str):
        normalized = raw_value.strip().lower()
        if normalized in {"true", "1"}:
            return True
        if normalized in {"false", "0"}:
            return False
    raise MethodInputError(format_argument_error(argument, "expected a boolean value."))


def coerce_int(raw_value: Any, argument: MethodArgument) -> int:
    if isinstance(raw_value, bool):
        raise MethodInputError(format_argument_error(argument, "expected an integer value."))
    if isinstance(raw_value, int):
        return raw_value
    if isinstance(raw_value, str):
        try:
            return int(raw_value.strip(), 10)
        except Exception as exc:
            raise MethodInputError(
                format_argument_error(argument, "expected an integer value.")
            ) from exc
    raise MethodInputError(format_argument_error(argument, "expected an integer value."))


def coerce_float(raw_value: Any, argument: MethodArgument) -> float:
    if isinstance(raw_value, bool):
        raise MethodInputError(format_argument_error(argument, "expected a numeric value."))
    if isinstance(raw_value, int | float):
        return float(raw_value)
    if isinstance(raw_value, str):
        try:
            return float(raw_value.strip())
        except Exception as exc:
            raise MethodInputError(
                format_argument_error(argument, "expected a numeric value.")
            ) from exc
    raise MethodInputError(format_argument_error(argument, "expected a numeric value."))


def coerce_string(raw_value: Any) -> str:
    if isinstance(raw_value, str):
        return raw_value
    return str(raw_value)


def coerce_datetime(raw_value: Any, argument: MethodArgument) -> datetime:
    if isinstance(raw_value, datetime):
        return raw_value
    if isinstance(raw_value, str):
        candidate = raw_value.strip().replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(candidate)
        except Exception as exc:
            raise MethodInputError(
                format_argument_error(argument, "expected an ISO datetime string.")
            ) from exc
    raise MethodInputError(
        format_argument_error(argument, "expected an ISO datetime string.")
    )


def coerce_guid(raw_value: Any, argument: MethodArgument) -> UUID:
    if isinstance(raw_value, UUID):
        return raw_value
    if isinstance(raw_value, str):
        try:
            return UUID(raw_value.strip())
        except Exception as exc:
            raise MethodInputError(
                format_argument_error(argument, "expected a GUID string.")
            ) from exc
    raise MethodInputError(format_argument_error(argument, "expected a GUID string."))


def coerce_bytestring(raw_value: Any, argument: MethodArgument) -> ua.ByteString:
    if isinstance(raw_value, (bytes, bytearray)):
        return ua.ByteString(bytes(raw_value))
    if isinstance(raw_value, str):
        candidate = raw_value.strip()
        if candidate.startswith("base64:"):
            try:
                return ua.ByteString(base64.b64decode(candidate.removeprefix("base64:")))
            except Exception as exc:
                raise MethodInputError(
                    format_argument_error(
                        argument,
                        "expected a utf-8 string or base64:... byte string.",
                    )
                ) from exc
        return ua.ByteString(candidate.encode("utf-8"))
    raise MethodInputError(
        format_argument_error(
            argument,
            "expected a utf-8 string or base64:... byte string.",
        )
    )


def coerce_node_id(raw_value: Any, argument: MethodArgument) -> ua.NodeId:
    if isinstance(raw_value, ua.NodeId):
        return raw_value
    if isinstance(raw_value, str):
        try:
            return ua.NodeId.from_string(raw_value.strip())
        except Exception as exc:
            raise MethodInputError(
                format_argument_error(argument, "expected a NodeId string like ns=2;i=123.")
            ) from exc
    raise MethodInputError(
        format_argument_error(argument, "expected a NodeId string like ns=2;i=123.")
    )


def coerce_expanded_node_id(raw_value: Any, argument: MethodArgument) -> ua.ExpandedNodeId:
    if isinstance(raw_value, ua.ExpandedNodeId):
        return raw_value
    if isinstance(raw_value, str):
        try:
            return ua.ExpandedNodeId.from_string(raw_value.strip())
        except Exception as exc:
            raise MethodInputError(
                format_argument_error(
                    argument,
                    "expected an ExpandedNodeId string.",
                )
            ) from exc
    raise MethodInputError(
        format_argument_error(argument, "expected an ExpandedNodeId string.")
    )


def coerce_qualified_name(raw_value: Any, argument: MethodArgument) -> ua.QualifiedName:
    if isinstance(raw_value, ua.QualifiedName):
        return raw_value
    if isinstance(raw_value, str):
        candidate = raw_value.strip()
        namespace_index = 0
        name = candidate
        if ":" in candidate:
            prefix, suffix = candidate.split(":", 1)
            if prefix.isdigit():
                namespace_index = int(prefix)
                name = suffix
        return ua.QualifiedName(name, namespace_index)
    raise MethodInputError(
        format_argument_error(argument, "expected a QualifiedName string.")
    )


def coerce_localized_text(raw_value: Any, argument: MethodArgument) -> ua.LocalizedText:
    if isinstance(raw_value, ua.LocalizedText):
        return raw_value
    if isinstance(raw_value, str):
        return ua.LocalizedText(raw_value)
    if isinstance(raw_value, dict):
        text = raw_value.get("text")
        locale = raw_value.get("locale")
        if text is None and locale is None:
            raise MethodInputError(
                format_argument_error(
                    argument,
                    "expected a string or {text, locale} object.",
                )
            )
        return ua.LocalizedText(text or "", locale)
    raise MethodInputError(
        format_argument_error(argument, "expected a string or {text, locale} object.")
    )


def format_argument_error(argument: MethodArgument, detail: str) -> str:
    label = argument.name or "unnamed"
    type_name = argument.data_type_node_id or "unknown"
    return f'Invalid value for argument "{label}" ({type_name}): {detail}'


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
    coerced_args = coerce_method_args(args, input_arguments or [])
    motion_device_node = client.get_node(motion_device_node_id)
    method_node = client.get_node(method_node_id)
    output = await motion_device_node.call_method(method_node.nodeid, *coerced_args)

    return {
        "method": method_name,
        "inputs": inputs,
        "args": to_jsonable(coerced_args),
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
    input_arguments = await read_method_arguments(method_node, "InputArguments")
    validate_method_args(
        method_name=method_node_id,
        args=args,
        input_arguments=input_arguments,
    )
    coerced_args = coerce_method_args(args, input_arguments)
    parent_node = await method_node.get_parent()
    output = await parent_node.call_method(method_node.nodeid, *coerced_args)

    return {
        "methodNodeId": method_node_id,
        "inputs": inputs,
        "args": to_jsonable(coerced_args),
        "output": to_jsonable(output),
        "status": "ok",
    }
