from backend.models.opcua import MethodBinding, SkillBinding
from backend.opcua.asyncua_discovery import filter_skill_owned_methods, merge_bindings


def test_merge_bindings_prefers_local_over_global() -> None:
    global_methods = {
        "go_to": MethodBinding(nodeId="ns=4;s=Global.GoTo"),
        "create_new_session": MethodBinding(nodeId="ns=4;s=Global.CreateSession"),
    }
    local_methods = {
        "go_to": MethodBinding(nodeId="ns=4;s=Local.GoTo"),
    }

    merged = merge_bindings(local_methods, global_methods)

    assert merged["go_to"].node_id == "ns=4;s=Local.GoTo"
    assert merged["create_new_session"].node_id == "ns=4;s=Global.CreateSession"


def test_merge_bindings_keeps_global_skills_when_local_robot_has_none() -> None:
    global_skills = {
        "go_to": SkillBinding(nodeId="ns=4;s=Global.GoToSkill"),
    }

    merged = merge_bindings({}, global_skills)

    assert merged["go_to"].node_id == "ns=4;s=Global.GoToSkill"


def test_filter_skill_owned_methods_removes_methods_embedded_in_skills() -> None:
    methods = {
        "start": MethodBinding(nodeId="ns=4;s=MotionDevice_1.go_to.Start"),
        "halt": MethodBinding(nodeId="ns=4;s=MotionDevice_1.go_to.Halt"),
        "custom_method": MethodBinding(nodeId="ns=4;s=MotionDevice_1.custom_method"),
    }
    skills = {
        "go_to": SkillBinding(
            nodeId="ns=4;s=MotionDevice_1.go_to",
            startNodeId="ns=4;s=MotionDevice_1.go_to.Start",
            haltNodeId="ns=4;s=MotionDevice_1.go_to.Halt",
        )
    }

    filtered = filter_skill_owned_methods(methods, skills)

    assert "start" not in filtered
    assert "halt" not in filtered
    assert filtered["custom_method"].node_id == "ns=4;s=MotionDevice_1.custom_method"
