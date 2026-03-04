"""
REST API endpoints for OPC UA node browsing and rendering.

Extracted from opcua.py to separate API routing from OPC UA business logic.
"""

from fastapi import Request, Query, APIRouter
from fastapi.templating import Jinja2Templates
from asyncua import ua

from dt_robot_control.opcua.opcua_client import OPCUAClient
from dt_robot_control.opcua.address_space_helpers import collect_node_details
from dt_robot_control.services.client_registry import client_registry


router = APIRouter()
templates = Jinja2Templates(directory="templates")


def get_client(url: str) -> OPCUAClient | None:
    """Get a client for the given URL or None.

    Args:
        url (str): OPC UA server URL.

    Returns:
        OPCUAClient | None: Client instance or None if not registered.
    """
    return client_registry.get(url)


@router.get("/device_set_rendered")
async def get_device_set(request: Request, url: str = Query(...)):
    """Show the complete DeviceSet tree.

    Args:
        request (Request): FastAPI request object.
        url (str): OPC UA server URL.

    Returns:
        TemplateResponse: Rendered device set page.
    """
    client = get_client(url)
    if not client:
        return templates.TemplateResponse(
            "device_set.html",
            {"request": request, "items": [], "error": f"No OPC UA client connected for URL: {url}"}
        )
    try:
        root = client.client.get_root_node()
        detailed = await collect_node_details(root)
        return templates.TemplateResponse("device_set.html", {"request": request, "items": detailed})
    except Exception as e:
        print(f"[{url}] Error while reading DeviceSet: {e}")
        return templates.TemplateResponse(
            "device_set.html",
            {"request": request, "items": [], "error": str(e)}
        )


@router.get("/subtree_children")
async def subtree_children(request: Request, url: str = Query(...), nodeid: str = Query(...)):
    """Show the children of a node.

    Args:
        request (Request): FastAPI request object.
        url (str): OPC UA server URL.
        nodeid (str): NodeId string.

    Returns:
        TemplateResponse: Rendered children fragment.
    """
    client = get_client(url)
    if not client:
        return "No OPC UA client connected"
    node = client.client.get_node(nodeid)
    detailed = await collect_node_details(node, children_depth=2)
    return templates.TemplateResponse("children_fragment.html", {"request": request, "items": detailed})


@router.get("/node_rendered")
async def node_rendered(request: Request, url: str = Query(...), nodeid: str = Query(...)):
    """Show details of a single node.

    Args:
        request (Request): FastAPI request object.
        url (str): OPC UA server URL.
        nodeid (str): NodeId string.

    Returns:
        TemplateResponse: Rendered node fragment.
    """
    client = get_client(url)
    if not client:
        return "No OPC UA client for this URL"
    node = client.client.get_node(nodeid)
    detail = await collect_node_details(node, children_depth=0) 
    return templates.TemplateResponse("node_fragment.html", {"request": request, "item": detail})


@router.get("/references")
async def get_references(url: str = Query(...), nodeid: str = Query(...)):
    """Show references of a node.

    Args:
        url (str): OPC UA server URL.
        nodeid (str): NodeId string.

    Returns:
        list | dict: List of reference dicts or error payload.
    """
    client = get_client(url)
    if not client:
        return {"error": f"No OPC UA client connected for {url}"}
    
    try:
        node = client.client.get_node(nodeid)
        refs = await node.get_references()

        if refs:
            refs = refs[1:]  # Remove first element

        async def safe_display_name(node_id):
            try:
                dn_node = client.client.get_node(node_id)
                display_name = await dn_node.read_display_name()
                text = display_name.Text.strip() if display_name and display_name.Text else ""
                return text if text else "null"
            except Exception:
                return "null"

        async def ref_to_dict(ref: ua.ReferenceDescription):
            ref_type_name = await safe_display_name(ref.ReferenceTypeId)
            type_def_name = await safe_display_name(ref.TypeDefinition) if ref.TypeDefinition.Identifier != 0 else "Null"

            return {
                "ReferenceType": f"{ref_type_name} ({ref.ReferenceTypeId.to_string()})",
                "NodeId": ref.NodeId.to_string(),
                "BrowseName": ref.BrowseName.to_string(),
                "TypeDefinition": f"{type_def_name} ({ref.TypeDefinition.to_string()})" if type_def_name != "Null" else "Null"
            }

        result = []
        for ref in refs:
            result.append(await ref_to_dict(ref))

        return result

    except Exception as e:
        return {"error": str(e)}
