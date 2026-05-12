from __future__ import annotations

from pydantic import Field

from .opcua import MethodArgument
from .base import ContractModel


class AddressSpaceNode(ContractModel):
    node_id: str
    display_name: str | None = None
    browse_name: str | None = None
    node_class: str | None = None
    has_children: bool = False


class AddressSpaceReference(ContractModel):
    reference_type: str
    node_id: str
    browse_name: str | None = None
    type_definition: str | None = None


class AddressSpaceNodeDetails(ContractModel):
    node_id: str
    browse_name: str | None = None
    display_name: str | None = None
    node_class: str | None = None
    node_class_value: int | None = None
    description: str | None = None
    value: object | None = None
    data_type: str | None = None
    event_notifier: str | None = None
    input_arguments: list[MethodArgument] = Field(default_factory=list)
    output_arguments: list[MethodArgument] = Field(default_factory=list)
