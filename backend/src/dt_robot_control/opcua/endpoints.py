"""
REST API endpoints for OPC UA node browsing and rendering.

Extracted from opcua.py to separate API routing from OPC UA logic.
"""

from typing import Any

from fastapi import Request, Query, APIRouter, HTTPException
from fastapi.templating import Jinja2Templates
from asyncua import Client
from asyncua import ua
from asyncua.ua.uaerrors import UaError

from dt_robot_control.opcua.opcua_client import OPCUAClient
from dt_robot_control.opcua.address_space_helpers import collect_node_details
from dt_robot_control.services.client_registry import client_registry


router = APIRouter()
templates = Jinja2Templates(directory="templates")


def _jsonable_value(value: Any) -> Any:
    """Best-effort conversion to JSON-friendly values.

    Args:
        value (Any): Any runtime value from OPC UA.

    Returns:
        Any: JSON-compatible primitive/collection or string fallback.
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [_jsonable_value(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _jsonable_value(v) for k, v in value.items()}
    return str(value)


def get_client(url: str) -> OPCUAClient | None:
    """Get a client for the given URL or None.

    Args:
        url (str): OPC UA server URL.

    Returns:
        OPCUAClient | None: Client instance or None if not registered.
    """
    return client_registry.get(url)


@router.get("/opcua/browse")
async def browse(url: str, node_id: str = "i=84"):
    """Browse direct children of a node.

    Reuses an already connected OPC UA client if available, otherwise
    falls back to a short-lived per-request asyncua client.

    Args:
        url (str): OPC UA server URL.
        node_id (str): NodeId to browse. Defaults to Root ("i=84").

    Returns:
        dict: Node children payload for frontend lazy-loading.
    """
    wrapper = None
    try:
        wrapper = get_client(url)
    except Exception:
        wrapper = None

    async def _browse_with_asyncua_client(client: Client):
        node = client.get_node(node_id)
        children = await node.get_children()

        result = []
        for ch in children:
            browse_name = await ch.read_browse_name()
            display_name = await ch.read_display_name()
            node_class = await ch.read_node_class()

            result.append(
                {
                    "nodeId": ch.nodeid.to_string(),
                    "browseName": f"{browse_name.NamespaceIndex}:{browse_name.Name}",
                    "displayName": display_name.Text,
                    "nodeClass": node_class.name,
                }
            )

        return {"url": url, "nodeId": node_id, "children": result}

    try:
        if wrapper is not None and hasattr(wrapper, "client") and wrapper.client is not None:
            return await _browse_with_asyncua_client(wrapper.client)

        async with Client(url=url) as client:
            return await _browse_with_asyncua_client(client)

    except UaError as e:
        raise HTTPException(status_code=400, detail=f"OPC UA error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {e}")


@router.get("/opcua/root")
async def get_root_node(url: str):
    """Return RootFolder metadata for a server.

    Reuses an already connected OPC UA client if available, otherwise
    falls back to a short-lived per-request asyncua client.

    Args:
        url (str): OPC UA server URL.

    Returns:
        dict: Root node metadata.
    """
    wrapper = None
    try:
        wrapper = get_client(url)
    except Exception:
        wrapper = None

    async def _read_root(client: Client):
        root = client.get_root_node()
        browse_name = await root.read_browse_name()
        display_name = await root.read_display_name()
        node_class = await root.read_node_class()

        return {
            "nodeId": root.nodeid.to_string(),
            "browseName": f"{browse_name.NamespaceIndex}:{browse_name.Name}",
            "displayName": display_name.Text,
            "nodeClass": node_class.name,
        }

    try:
        if wrapper is not None and hasattr(wrapper, "client") and wrapper.client is not None:
            return await _read_root(wrapper.client)

        async with Client(url=url) as client:
            return await _read_root(client)

    except UaError as e:
        raise HTTPException(status_code=400, detail=f"OPC UA error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {e}")


@router.get("/node_value")
async def get_node_value(url: str, nodeid: str):
    """Read current value of a variable node.

    Args:
        url (str): OPC UA server URL.
        nodeid (str): NodeId of the target variable.

    Returns:
        dict: Node id and current value.
    """
    client = get_client(url)
    if not client:
        raise HTTPException(status_code=404, detail="No client connected for this URL")

    try:
        node = client.client.get_node(nodeid)
        value = await node.read_value()
        return {"nodeId": nodeid, "value": _jsonable_value(value)}
    except UaError as e:
        raise HTTPException(status_code=400, detail=f"OPC UA error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading node value: {e}")


@router.get("/node_details")
async def get_node_details(url: str, node_id: str):
    """Read node attributes used by the properties panel.

    Args:
        url (str): OPC UA server URL.
        node_id (str): NodeId string.

    Returns:
        dict: Node metadata and class-specific details.
    """
    client = get_client(url)
    if not client:
        raise HTTPException(status_code=404, detail="No client connected for this URL")

    try:
        node = client.client.get_node(node_id)

        browse_name = await node.read_browse_name()
        display_name = await node.read_display_name()
        node_class = await node.read_node_class()

        result = {
            "nodeId": node_id,
            "browseName": f"{browse_name.NamespaceIndex}:{browse_name.Name}",
            "displayName": display_name.Text,
            "nodeClass": node_class.name,
            "nodeClassValue": node_class.value,
        }

        try:
            desc = await node.read_description()
            result["description"] = desc.Text if desc else None
        except Exception:
            result["description"] = None

        if node_class.name == "Variable":
            try:
                result["value"] = _jsonable_value(await node.read_value())
            except Exception:
                result["value"] = None

            try:
                data_type = await node.read_data_type()
                result["dataType"] = data_type.to_string()
            except Exception:
                result["dataType"] = None

            try:
                attr = await node.read_attribute(ua.AttributeIds.AccessLevel)
                result["accessLevel"] = _jsonable_value(
                    getattr(getattr(attr, "Value", None), "Value", None)
                )
            except Exception:
                result["accessLevel"] = None

        if node_class.name == "Object":
            try:
                attr = await node.read_attribute(ua.AttributeIds.EventNotifier)
                result["eventNotifier"] = _jsonable_value(
                    getattr(getattr(attr, "Value", None), "Value", None)
                )
            except Exception:
                result["eventNotifier"] = None

        return result

    except UaError as e:
        raise HTTPException(status_code=400, detail=f"OPC UA error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading node details: {e}")


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
