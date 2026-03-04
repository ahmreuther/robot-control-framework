"""
Helpers to read/browse OPC UA nodes for rendering.

Pulled out from the legacy GetAddressSpace/opcua modules so templating/REST rendering does not mix
with client transport code. Provides reusable utilities for both REST fragments and websocket flows.
"""

from asyncua import ua

# --- Constants ---
data_type_mapping = {
    1: "Boolean",
    2: "SByte",
    3: "Byte",
    4: "Int16",
    5: "UInt16",
    6: "Int32",
    7: "UInt32",
    8: "Int64",
    9: "UInt64",
    10: "Float",
    11: "Double",
    12: "String",
    13: "DateTime",
    14: "Guid",
    15: "ByteString",
    16: "XmlElement",
    17: "NodeId",
    18: "ExpandedNodeId",
    19: "StatusCode",
    20: "QualifiedName",
    21: "LocalizedText",
    22: "ExtensionObject",
    23: "DataValue",
    24: "Variant",
    25: "DiagnosticInfo"
}

pictogram_mapping = {
    0: "❓",
    1: "🔴",
    2: "🔢",
    4: "(x)",
    8: "🧱",
    16: "🔢📏",
    32: "🔗",
    64: "💾",
    128: "👁️",
    4294967295: "🚫"
}
def _to_data_type_name(data_type_id: int) -> str:
    """Resolve a DataType identifier to a human-readable name.

    Args:
        data_type_id (int): Numeric UA DataType identifier.

    Returns:
        str: Human-readable DataType name.
    """
    return data_type_mapping.get(data_type_id, "Unknown DataType")


# --- Helper Functions ---
async def collect_all_nodes(node, collect_maximum=500000):
    """Collect all nodes under a specific node, up to a maximum count.

    Args:
        node: Starting UA node.
        collect_maximum (int): Max number of nodes to collect.

    Returns:
        list: UA nodes discovered via DFS-style traversal.
    """
    all_nodes = []
    unsearched = [node]
    while unsearched and len(all_nodes) < collect_maximum:
        child = unsearched.pop()
        all_nodes.append(child)
        children = await child.get_children()
        unsearched.extend(children)
    return all_nodes

async def read_all_attributes(node):
    """Read a standard set of UA attributes and return them in a dict.

    Args:
        node: UA node to read attributes from.

    Returns:
        dict: Mapping of attribute names to attribute values.
    """
    attributes = [
        ua.AttributeIds.NodeId,
        ua.AttributeIds.NodeClass,
        ua.AttributeIds.BrowseName,
        ua.AttributeIds.DisplayName,
        ua.AttributeIds.Description,
        ua.AttributeIds.WriteMask,
        ua.AttributeIds.UserWriteMask,
        ua.AttributeIds.AccessLevel,
        ua.AttributeIds.ArrayDimensions,
        ua.AttributeIds.DataType,
        ua.AttributeIds.Historizing,
        ua.AttributeIds.EventNotifier,
        ua.AttributeIds.Value,
        ua.AttributeIds.MinimumSamplingInterval,
        ua.AttributeIds.UserAccessLevel,
        ua.AttributeIds.RolePermissions
        
    ]
    results = await node.read_attributes(attributes)
    attr_dict = {attr.name: result.Value for attr, result in zip(attributes, results) if result.StatusCode.is_good()}
    # Map DataType IDs to names
    if 'DataType' in attr_dict:
        data_type_id = attr_dict['DataType'].Value.Identifier
        attr_dict['DataTypeName'] = _to_data_type_name(data_type_id)
    return attr_dict

def map_type_to_pictogram(node_class_value):
    """Map a UA NodeClass numeric value to an icon string.

    Args:
        node_class_value (int): Numeric NodeClass value.

    Returns:
        str: Emoji/icon string representing the NodeClass.
    """
    return pictogram_mapping.get(node_class_value, "❓")

def format_argument(arg: ua.Argument) -> str:
    """Format a UA Argument into a compact HTML list item.

    Args:
        arg (ua.Argument): UA Argument instance.

    Returns:
        str: HTML list item string.
    """
    return f"<li><strong>{arg.Name}</strong>: {arg.Description.Text if arg.Description else ''} (Type: {data_type_mapping.get(arg.DataType.Identifier, 'Unknown')}, Rank: {arg.ValueRank})</li>"

async def collect_node_details(node, children_only=False, children_depth=2):
    """
    children_only=True: Returns only a list of direct children for this node.
    children_depth > 0: Returns the node and as many child levels as requested.
    Standard: only the current node (no children).

    Args:
        node: UA node to inspect.
        children_only (bool): When True, return only direct children (non-recursive).
        children_depth (int): Depth of recursive child expansion.

    Returns:
        dict | list: Node detail dict, or list of child dicts when children_only is True.
    """
    node_detail = await read_all_attributes(node)
    node_class = node_detail.get('NodeClass').Value if node_detail.get('NodeClass') else 0
    node_detail['Pictogram'] = map_type_to_pictogram(node_class)
    node_detail['Name'] = node_detail.get('DisplayName').Value.Text if node_detail.get('DisplayName') else 'Unknown Node'
    node_detail['Attributes'] = {attr: getattr(node_detail.get(attr), 'Value', 'N/A') for attr in node_detail}

    # Special case for Input/Output-Arguments as Value HTML
    if node_detail['Name'] in ["InputArguments", "OutputArguments"]:
        try:
            val = await node.read_value()
            if isinstance(val, list) and all(hasattr(v, 'Name') for v in val):
                html_list = "<ul>"
                for arg in val:
                    name = arg.Name or "Unnamed"
                    dtype = data_type_mapping.get(arg.DataType.Identifier, str(arg.DataType))
                    desc = getattr(arg.Description, 'Text', '') if arg.Description else ''
                    rank = arg.ValueRank
                    html_list += (
                        f"<li class='arg-item'>"
                        f"<span class='arg-name'>{name}</span>"
                        f"<span class='arg-description'> – {desc}</span>"
                        f"<span class='arg-meta'>(Type: {dtype}, Rank: {rank})</span>"
                        f"</li>"
                    )
                html_list += "</ul>"
                node_detail['Attributes']['Value'] = html_list
        except Exception as e:
            print(f"Error reading {node_detail['Name']}: {e}")

    if children_only:
        # Liefere nur alle direkten Children als Liste, OHNE Rekursion!
        children = await node.get_children()
        children_list = []
        for child in children:
            try:
                c = await read_all_attributes(child)
                c_class = c.get('NodeClass').Value if c.get('NodeClass') else 0
                c['Pictogram'] = map_type_to_pictogram(c_class)
                c['Name'] = c.get('DisplayName').Value.Text if c.get('DisplayName') else 'Unknown Node'
                c['Attributes'] = {attr: getattr(c.get(attr), 'Value', 'N/A') for attr in c}
                # Optional: check if children exist (for UI indicator)
                c['HasChildren'] = bool(await child.get_children())
                children_list.append(c)
            except Exception as e:
                print(f"Error reading child node: {e}")
        return children_list

    elif children_depth > 0:
        # Fetch this node and a specific depth of children
        node_detail['Children'] = []
        children = await node.get_children()
        for child in children:
            try:
                c_detail = await collect_node_details(child, children_depth=children_depth-1)
                node_detail['Children'].append(c_detail)
            except Exception as e:
                print(f"Error collecting children: {e}")
        return node_detail

    else:
        # Standard: return node WITHOUT children
        node_detail['Children'] = None
        return node_detail

async def collect_tree_along_path(node, open_path):
    """
    Holt alle Details zum Knoten, expandiert aber NUR die Children,
    wenn der Knoten im open_path ist.

    Args:
        node: UA node to inspect.
        open_path (Iterable[str]): NodeId strings to expand.

    Returns:
        dict: Node detail dict with selectively expanded children.
    """
    nodeid_str = node.nodeid.to_string()
    detail = await collect_node_details(node, children_depth=0)  # No children
    detail['Children'] = []

    if nodeid_str in open_path:
        # Fetch ONLY children for this node and call collect_tree_along_path recursively,
        # aber nur für die Children, die ebenfalls im open_path liegen
        children = await node.get_children()
        for child in children:
            child_id = child.nodeid.to_string()
            if child_id in open_path:
                c_detail = await collect_tree_along_path(child, open_path)
                detail['Children'].append(c_detail)
            else:
                # For other children, fetch minimal info if needed
                c_detail = await collect_node_details(child, children_depth=0)
                detail['Children'].append(c_detail)
    else:
        # Do not expand children
        detail['Children'] = []

    return detail