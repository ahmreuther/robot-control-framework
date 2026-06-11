from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

from backend.models.robot import RobotActionBinding, RobotActionState
from backend.opcua.server_connection import AsyncUaServerConnection

from .robot_session import RobotSession


class RobotActionExecutionError(ValueError):
    """Raised when a normalized robot action cannot be executed."""


@dataclass
class ExecutedRobotAction:
    state: RobotActionState
    node_id: str | None
    result: Any = None


def normalize_action_input_name(name: str) -> str:
    with_underscores = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", with_underscores).strip("_")
    return normalized.lower()


def _extract_current_state_text(raw_value: Any) -> str | None:
    if raw_value is None:
        return None
    if isinstance(raw_value, dict):
        for key in ("Text", "text", "Name", "name"):
            value = raw_value.get(key)
            if value:
                return str(value)
        return str(raw_value)
    return str(raw_value)


def require_robot_action(robot: RobotSession, action_name: str) -> RobotActionBinding:
    action = robot.info.actions.get(action_name)
    if action is None:
        raise RobotActionExecutionError(
            f'Robot "{robot.robot_id}" has no normalized action binding for {action_name!r}.'
        )
    return action


async def execute_robot_action(
    *,
    robot: RobotSession,
    action_name: str,
    inputs: dict[str, Any],
    connection: AsyncUaServerConnection,
) -> ExecutedRobotAction:
    action = require_robot_action(robot, action_name)
    if action.kind == "method":
        return await _execute_method_action(
            robot=robot,
            action_name=action_name,
            action=action,
            inputs=inputs,
            connection=connection,
        )
    return await _execute_skill_action(
        robot=robot,
        action_name=action_name,
        action=action,
        inputs=inputs,
        connection=connection,
    )


async def transition_robot_action(
    *,
    robot: RobotSession,
    action_name: str,
    transition: Literal["halt", "reset"],
    connection: AsyncUaServerConnection,
) -> ExecutedRobotAction:
    action = require_robot_action(robot, action_name)
    if action.kind != "skill":
        raise RobotActionExecutionError(
            f'Action {action_name!r} on robot "{robot.robot_id}" does not support {transition}.'
        )

    transition_node_id = action.halt_node_id if transition == "halt" else action.reset_node_id
    if transition_node_id is None:
        raise RobotActionExecutionError(
            f'Action {action_name!r} on robot "{robot.robot_id}" has no {transition} transition.'
        )

    result = await connection.call_raw_method(method_node_id=transition_node_id, inputs={"args": []})
    current_state = await _read_skill_current_state(connection, action)
    status = "halted" if transition == "halt" else "reset"

    return ExecutedRobotAction(
        state=RobotActionState(
            action_name=action_name,
            kind=action.kind,
            status=status,
            current_state=current_state,
        ),
        node_id=transition_node_id,
        result=result,
    )


async def _execute_method_action(
    *,
    robot: RobotSession,
    action_name: str,
    action: RobotActionBinding,
    inputs: dict[str, Any],
    connection: AsyncUaServerConnection,
) -> ExecutedRobotAction:
    method_binding = robot.info.opcua.methods.get(action.target_name)
    if method_binding is None or action.method_node_id is None:
        raise RobotActionExecutionError(
            f'Action {action_name!r} on robot "{robot.robot_id}" has no resolved method binding.'
        )

    method_inputs = _normalize_method_action_inputs(
        action_name=action_name,
        action=action,
        inputs=inputs,
        argument_names=[argument.name for argument in method_binding.input_arguments],
    )

    result = await connection.call_robot_method(
        motion_device_node_id=robot.info.motion_device.node_id,
        method_name=action.target_name,
        method_node_id=action.method_node_id,
        inputs=method_inputs,
        input_arguments=method_binding.input_arguments,
    )
    return ExecutedRobotAction(
        state=RobotActionState(
            action_name=action_name,
            kind=action.kind,
            status="succeeded",
        ),
        node_id=action.method_node_id,
        result=result,
    )


async def _execute_skill_action(
    *,
    robot: RobotSession,
    action_name: str,
    action: RobotActionBinding,
    inputs: dict[str, Any],
    connection: AsyncUaServerConnection,
) -> ExecutedRobotAction:
    skill_binding = robot.info.opcua.skills.get(action.target_name)
    if skill_binding is None:
        raise RobotActionExecutionError(
            f'Action {action_name!r} on robot "{robot.robot_id}" has no resolved skill binding.'
        )
    if action.start_node_id is None:
        raise RobotActionExecutionError(
            f'Action {action_name!r} on robot "{robot.robot_id}" has no start transition.'
        )

    normalized_inputs = {
        normalize_action_input_name(name): value for name, value in inputs.items()
    }
    unknown_inputs = sorted(set(normalized_inputs) - set(skill_binding.parameters))
    if unknown_inputs:
        allowed = ", ".join(sorted(skill_binding.parameters)) or "<none>"
        raise RobotActionExecutionError(
            f"Unknown inputs for action {action_name!r}: {', '.join(unknown_inputs)}. "
            f"Allowed inputs: {allowed}."
        )

    for parameter_name, value in normalized_inputs.items():
        parameter_binding = skill_binding.parameters.get(parameter_name)
        if parameter_binding is None:
            continue
        try:
            await connection.write_node_value(
                parameter_binding.node_id,
                value,
                coerce_to_existing=True,
            )
        except Exception as exc:
            raise RobotActionExecutionError(
                "Failed to write skill parameter "
                f"{parameter_name!r} for action {action_name!r} on robot "
                f'"{robot.robot_id}" (node {parameter_binding.node_id}) with '
                f"value {value!r}: {exc}"
            ) from exc

    try:
        result = await connection.call_raw_method(
            method_node_id=action.start_node_id,
            inputs={"args": []},
        )
    except Exception as exc:
        raise RobotActionExecutionError(
            f"Failed to start skill action {action_name!r} on robot "
            f'"{robot.robot_id}" via {action.start_node_id} after writing '
            f"inputs {normalized_inputs!r}: {exc}"
        ) from exc
    current_state = await _read_skill_current_state(connection, action)
    return ExecutedRobotAction(
        state=RobotActionState(
            action_name=action_name,
            kind=action.kind,
            status="running",
            current_state=current_state,
        ),
        node_id=action.skill_node_id or action.start_node_id,
        result=result,
    )


async def _read_skill_current_state(
    connection: AsyncUaServerConnection,
    action: RobotActionBinding,
) -> str | None:
    if action.current_state_node_id is None:
        return None
    raw_value = await connection.read_node_value(action.current_state_node_id)
    return _extract_current_state_text(raw_value)


def _normalize_method_action_inputs(
    *,
    action_name: str,
    action: RobotActionBinding,
    inputs: dict[str, Any],
    argument_names: list[str | None],
) -> dict[str, Any]:
    if any(key in inputs for key in ("args", "arguments", "value", "joints")):
        return inputs

    if not argument_names:
        return inputs

    normalized_inputs = {
        normalize_action_input_name(name): value for name, value in inputs.items()
    }
    args: list[Any] = []
    missing: list[str] = []
    for raw_name in argument_names:
        normalized_name = normalize_action_input_name(raw_name or "")
        if not normalized_name:
            missing.append(raw_name or "<unnamed>")
            continue
        if normalized_name not in normalized_inputs:
            missing.append(raw_name or normalized_name)
            continue
        args.append(normalized_inputs[normalized_name])

    if missing:
        raise RobotActionExecutionError(
            f"Missing inputs for action {action_name!r}: {', '.join(missing)}."
        )

    unknown_inputs = sorted(set(normalized_inputs) - {
        normalize_action_input_name(name or "") for name in argument_names if name
    })
    if unknown_inputs:
        raise RobotActionExecutionError(
            f"Unknown inputs for action {action_name!r}: {', '.join(unknown_inputs)}."
        )

    return {"args": args}
