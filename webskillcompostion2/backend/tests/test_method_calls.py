import pytest
from asyncua import ua

from wsc2_backend.opcua.method_calls import (
    MethodInputError,
    call_robot_method,
    call_raw_method,
    coerce_method_args,
    normalize_method_inputs,
    to_jsonable,
    validate_method_args,
)
from wsc2_backend.models.opcua import MethodArgument


class FakeUaArgument:
    def __init__(
        self,
        *,
        name: str,
        data_type: str,
        value_rank: int = -1,
        array_dimensions: list[int] | None = None,
        description: str | None = None,
    ) -> None:
        self.Name = name
        self.DataType = ua.NodeId.from_string(data_type)
        self.ValueRank = value_rank
        self.ArrayDimensions = array_dimensions or []
        self.Description = ua.LocalizedText(description or "")


class FakeArgumentNode:
    def __init__(self, arguments: list[FakeUaArgument]) -> None:
        self.arguments = arguments

    async def read_value(self) -> list[FakeUaArgument]:
        return self.arguments


class FakeMethodNode:
    def __init__(self, input_arguments: list[FakeUaArgument] | None = None) -> None:
        self.nodeid = "ns=4;s=Method"
        self._input_arguments = input_arguments or []

    async def get_parent(self) -> "FakeObjectNode":
        return FakeObjectNode.instance

    async def get_child(self, browse_name: str) -> FakeArgumentNode:
        if browse_name == "0:InputArguments":
            return FakeArgumentNode(self._input_arguments)
        raise KeyError(browse_name)


class FakeObjectNode:
    instance: "FakeObjectNode"

    def __init__(self) -> None:
        self.calls: list[tuple[object, tuple[object, ...]]] = []
        FakeObjectNode.instance = self

    async def call_method(self, method_node_id: object, *args: object) -> object:
        self.calls.append((method_node_id, args))
        return {"accepted": True}


class FakeClient:
    def __init__(self, input_arguments: list[FakeUaArgument] | None = None) -> None:
        self.object_node = FakeObjectNode()
        self.method_node = FakeMethodNode(input_arguments)

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


def test_coerce_method_args_converts_scalars_and_arrays() -> None:
    arguments = [
        MethodArgument(name="enabled", dataTypeNodeId="i=1"),
        MethodArgument(name="speed", dataTypeNodeId="i=11"),
        MethodArgument(name="target", dataTypeNodeId="i=6", valueRank=1),
        MethodArgument(name="node", dataTypeNodeId="i=17"),
    ]

    coerced = coerce_method_args(
        ["true", "1.5", "[1,2,3]", "ns=2;i=42"],
        arguments,
    )

    assert coerced[0] is True
    assert coerced[1] == 1.5
    assert coerced[2] == [1, 2, 3]
    assert isinstance(coerced[3], ua.NodeId)
    assert coerced[3].to_string() == "ns=2;i=42"


def test_coerce_method_args_rejects_invalid_values() -> None:
    with pytest.raises(MethodInputError):
        coerce_method_args(
            ["not-bool"],
            [MethodArgument(name="enabled", dataTypeNodeId="i=1")],
        )

    with pytest.raises(MethodInputError):
        coerce_method_args(
            ["[1, bad]"],
            [MethodArgument(name="target", dataTypeNodeId="i=6", valueRank=1)],
        )


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


@pytest.mark.asyncio
async def test_call_raw_method_coerces_against_input_arguments() -> None:
    client = FakeClient(
        [
            FakeUaArgument(name="enabled", data_type="i=1"),
            FakeUaArgument(name="target", data_type="i=6", value_rank=1),
            FakeUaArgument(name="node", data_type="i=17"),
        ]
    )

    result = await call_raw_method(
        client=client,
        method_node_id="ns=4;s=Method",
        inputs={"args": ["true", "[1,2,3]", "ns=2;i=42"]},
    )

    called_method, called_args = client.object_node.calls[0]
    assert called_method == "ns=4;s=Method"
    assert called_args[0] is True
    assert called_args[1] == [1, 2, 3]
    assert isinstance(called_args[2], ua.NodeId)
    assert called_args[2].to_string() == "ns=2;i=42"
    assert result == {
        "methodNodeId": "ns=4;s=Method",
        "inputs": {"args": ["true", "[1,2,3]", "ns=2;i=42"]},
        "args": [True, [1, 2, 3], "ns=2;i=42"],
        "output": {"accepted": True},
        "status": "ok",
    }
