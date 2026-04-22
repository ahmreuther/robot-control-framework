import pytest

from wsc2_backend.opcua.method_calls import (
    MethodInputError,
    call_robot_method,
    normalize_method_inputs,
    to_jsonable,
    validate_method_args,
)
from wsc2_backend.models.opcua import MethodArgument


class FakeMethodNode:
    nodeid = "ns=4;s=Method"


class FakeObjectNode:
    def __init__(self) -> None:
        self.calls: list[tuple[object, tuple[object, ...]]] = []

    async def call_method(self, method_node_id: object, *args: object) -> object:
        self.calls.append((method_node_id, args))
        return {"accepted": True}


class FakeClient:
    def __init__(self) -> None:
        self.object_node = FakeObjectNode()
        self.method_node = FakeMethodNode()

    def get_node(self, node_id: str) -> object:
        if node_id == "ns=4;s=MotionDevice":
            return self.object_node
        if node_id == "ns=4;s=Method":
            return self.method_node
        raise KeyError(node_id)


def test_normalize_method_inputs_requires_ordered_args_for_multiple_values() -> None:
    assert normalize_method_inputs({"args": [1, 2]}) == [1, 2]
    assert normalize_method_inputs({"arguments": ["a"]}) == ["a"]
    assert normalize_method_inputs({"joints": [0, 1, 2]}) == [[0, 1, 2]]
    assert normalize_method_inputs({}) == []

    with pytest.raises(MethodInputError):
        normalize_method_inputs({"x": 1, "y": 2})

    with pytest.raises(MethodInputError):
        normalize_method_inputs({"args": "not a list"})


def test_to_jsonable_converts_known_shapes() -> None:
    class WithToString:
        def to_string(self) -> str:
            return "node-id"

    assert to_jsonable({"node": WithToString(), "values": (1, None)}) == {
        "node": "node-id",
        "values": [1, None],
    }


def test_validate_method_args_uses_discovered_signature_count() -> None:
    arguments = [MethodArgument(name="target", dataTypeNodeId="ns=0;i=11")]

    validate_method_args(method_name="goto", args=[[0, 1, 2]], input_arguments=arguments)

    with pytest.raises(MethodInputError):
        validate_method_args(method_name="goto", args=[], input_arguments=arguments)


@pytest.mark.asyncio
async def test_call_robot_method_calls_object_with_resolved_method_node() -> None:
    client = FakeClient()

    result = await call_robot_method(
        client=client,
        motion_device_node_id="ns=4;s=MotionDevice",
        method_name="goto",
        method_node_id="ns=4;s=Method",
        inputs={"args": [[0, 1, 2]]},
    )

    assert client.object_node.calls == [("ns=4;s=Method", ([0, 1, 2],))]
    assert result == {
        "method": "goto",
        "inputs": {"args": [[0, 1, 2]]},
        "args": [[0, 1, 2]],
        "output": {"accepted": True},
        "status": "ok",
    }
