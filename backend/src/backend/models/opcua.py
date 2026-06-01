from __future__ import annotations

from pydantic import Field

from .base import ContractModel


class NodeBinding(ContractModel):
    """Stable reference to one OPC UA node."""

    node_id: str
    display_name: str | None = None
    browse_name: str | None = None
    node_class: str | None = None


class MotionDeviceBinding(NodeBinding):
    """The OPC UA object that gives a backend robot its identity."""

    type_definition_node_id: str | None = None
    namespace_uri: str | None = None


class AxisBinding(ContractModel):
    """Resolved nodes for one MotionDevice axis."""

    axis_name: str
    axis_node_id: str
    actual_position_node_id: str | None = None
    engineering_units_node_id: str | None = None


class MethodArgument(ContractModel):
    """Argument metadata exposed by OPC UA InputArguments/OutputArguments."""

    name: str | None = None
    data_type_node_id: str | None = None
    value_rank: int | None = None
    array_dimensions: list[int] = Field(default_factory=list)
    description: str | None = None


class MethodBinding(NodeBinding):
    """Resolved method node plus its OPC UA call signature."""

    input_arguments: list[MethodArgument] = Field(default_factory=list)
    output_arguments: list[MethodArgument] = Field(default_factory=list)
