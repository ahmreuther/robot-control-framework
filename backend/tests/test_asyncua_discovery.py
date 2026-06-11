from backend.models.opcua import MethodBinding, SkillBinding
from backend.opcua.asyncua_discovery import merge_bindings


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
