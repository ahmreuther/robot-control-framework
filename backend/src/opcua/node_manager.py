
from asyncua import Client, ua, Node

import asyncio
import json


# DataType Mapping
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
# Async function for collecting all nodes under a specific node, now renamed to avoid conflict
async def collect_all_nodes(node, collect_maximum=500000):
    all_nodes = []
    unsearched = [node]
    while unsearched and len(all_nodes) < collect_maximum:
        child = unsearched.pop()
        all_nodes.append(child)
        children = await child.get_children()
        unsearched.extend(children)
    return all_nodes

async def read_all_attributes(node):
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
        attr_dict['DataTypeName'] = data_type_mapping.get(data_type_id, "Unknown DataType")
    return attr_dict

def map_type_to_pictogram(node_class_value):
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
    return pictogram_mapping.get(node_class_value, "❓")

def format_argument(arg: ua.Argument) -> str:
    return f"<li><strong>{arg.Name}</strong>: {arg.Description.Text if arg.Description else ''} (Type: {data_type_mapping.get(arg.DataType.Identifier, 'Unknown')}, Rank: {arg.ValueRank})</li>"

async def collect_node_details(node, children_only=False, children_depth=2):
    """
    children_only=True: Liefert nur eine Liste der direkten Kinder dieses Knotens.
    children_depth > 0: Liefert Node und so viele Ebenen Children wie gewünscht.
    Standard: nur der aktuelle Node (ohne Children).
    """
    node_detail = await read_all_attributes(node)
    node_class = node_detail.get('NodeClass').Value if node_detail.get('NodeClass') else 0
    node_detail['Pictogram'] = map_type_to_pictogram(node_class)
    node_detail['Name'] = node_detail.get('DisplayName').Value.Text if node_detail.get('DisplayName') else 'Unknown Node'
    node_detail['Attributes'] = {attr: getattr(node_detail.get(attr), 'Value', 'N/A') for attr in node_detail}

    # Spezialfall für Input/Output-Arguments als Value-HTML
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
            print(f"Fehler beim Lesen von {node_detail['Name']}: {e}")

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
                # Optional: prüfe, ob Kinder vorhanden (für UI-Indikator)
                c['HasChildren'] = bool(await child.get_children())
                children_list.append(c)
            except Exception as e:
                print(f"Fehler beim Lesen von Child-Node: {e}")
        return children_list

    elif children_depth > 0:
        # Hole diese Node und eine bestimmte Tiefe Children
        node_detail['Children'] = []
        children = await node.get_children()
        for child in children:
            try:
                c_detail = await collect_node_details(child, children_depth=children_depth-1)
                node_detail['Children'].append(c_detail)
            except Exception as e:
                print(f"Fehler beim Sammeln von Children: {e}")
        return node_detail

    else:
        # Standard: Gib Node OHNE Children zurück
        node_detail['Children'] = None
        return node_detail

async def collect_tree_along_path(node, open_path):
    """
    Holt alle Details zum Knoten, expandiert aber NUR die Children,
    wenn der Knoten im open_path ist.
    """
    nodeid_str = node.nodeid.to_string()
    detail = await collect_node_details(node, children_depth=0)  # Ohne Kinder
    detail['Children'] = []

    if nodeid_str in open_path:
        # Hole NUR Children für diesen Knoten und rufe collect_tree_along_path rekursiv auf,
        # aber nur für die Children, die ebenfalls im open_path liegen
        children = await node.get_children()
        for child in children:
            child_id = child.nodeid.to_string()
            if child_id in open_path:
                c_detail = await collect_tree_along_path(child, open_path)
                detail['Children'].append(c_detail)
            else:
                # Für andere Children ggf. minimal Info holen
                c_detail = await collect_node_details(child, children_depth=0)
                detail['Children'].append(c_detail)
    else:
        # Keine Children expandieren
        detail['Children'] = []

    return detail
# above needs to be kept outside of class

class NodeManager:
    """Manages OPC UA node operations for the client."""

    def __init__(self, opcua_client):
        self.opcua_client = opcua_client              # wrapper
        self.asyncua_client = opcua_client.client      # asyncua.Client

        self.namespaces = opcua_client.namespaces
        self.name = opcua_client.name

    async def find_descendant_by_name(self, start_node, target_name: str):
        """
        Broad search (BFS) from start_node for a node whose DisplayName.Text
        OR BrowseName.Name matches target_name (case-insensitive).
        Cycles are prevented by ‘visited’.
        """
        target = (target_name or "").strip().lower()
        if not target:
            return None

        from collections import deque
        q = deque([start_node])
        visited = set()

        while q:
            node = q.popleft()
            try:
                nid = node.nodeid.to_string()
                if nid in visited:
                    continue
                visited.add(nid)

                # DisplayName
                try:
                    dn = await node.read_display_name()
                    dn_txt = getattr(dn, "Text", str(dn)) or ""
                except Exception:
                    dn_txt = ""

                # BrowseName
                try:
                    bn = await node.read_browse_name()
                    bn_name = getattr(bn, "Name", "") or ""
                except Exception:
                    bn_name = ""

                if dn_txt.lower() == target or bn_name.lower() == target:
                    return node

                for child in await node.get_children():
                    q.append(child)
            except Exception:
                continue
        return None
        
    async def _search_by_name(self, node, target_name: str):
        "helper method"
        target = (target_name or "").strip().lower()
        if not target:
            return None

        from collections import deque
        q = deque([node])
        visited = set()
        while q:
            cur = q.popleft()
            try:
                nid = cur.nodeid.to_string()
                if nid in visited:
                    continue
                visited.add(nid)

                try:
                    bn = await cur.read_browse_name()
                    bn_name = getattr(bn, "Name", "") or ""
                except Exception:
                    bn_name = ""

                if bn_name.lower() == target:
                    uri = self.namespaces[bn.NamespaceIndex] if bn.NamespaceIndex < len(self.namespaces) else None
                    print(f"[{self.name}] ✅ Found: {bn_name} (Namespace: {uri})")
                    return cur

                for child in await cur.get_children():
                    q.append(child)
            except Exception:
                continue
        return None

    async def find_child_by_name(self, start_path: list[str], name: str):
        """
        Search recursively from the node under start_path for BrowseName.Name == name
        (case-insensitive), cycle-proof.
        """
        try:
            start_node = await self.asyncua_client.nodes.root.get_child(start_path)
            return await self._search_by_name(start_node, name)
        except Exception as e:
            print(f"[{self.name}] ❌ Error in find_child_by_name: {e}")
            return None
    
    def _norm(self, s: str | None) -> str:
        return "".join((s or "").lower().split()) 


    async def find_method_by_names(self, name_variants: list[str]):
        wanted = {self._norm(n) for n in name_variants}
        
        start = await self.find_child_by_name(["0:Objects"], "DeviceSet")
        if not start:
            start = await self.client.nodes.root.get_child(["0:Objects"])

        from collections import deque
        q = deque([start])
        visited = set()
        best_node = None
        best_score = -1

        while q:
            node = q.popleft()
            try:
                nid = node.nodeid.to_string()
                if nid in visited:
                    continue
                visited.add(nid)

                try:
                    dn = await node.read_display_name()
                    dn_txt = getattr(dn, "Text", str(dn)) or ""
                except Exception:
                    dn_txt = ""
                try:
                    bn = await node.read_browse_name()
                    bn_txt = getattr(bn, "Name", "") or ""
                except Exception:
                    bn_txt = ""

                try:
                    nclass = await node.read_node_class()
                except Exception:
                    nclass = None
                if nclass != ua.NodeClass.Method:
                    for c in await node.get_children():
                        q.append(c)
                    continue

                norm_names = {self._norm(dn_txt), self._norm(bn_txt)}
                if not (norm_names & wanted):
                    continue

                score = 1
                try:
                    ia_node = await node.get_child("0:InputArguments")
                    args = await ia_node.read_value()
                    for a in args or []:
                        aname = (a.Name or "").lower()
                        dtid = getattr(a.DataType, "Identifier", None)
                        vrank = getattr(a, "ValueRank", -1)
                        if ("joint" in aname or "joints" in aname) and vrank == 1:
                            score = 3  
                            break
                        if vrank == 1 and dtid in (ua.ObjectIds.Float, ua.ObjectIds.Double):
                            score = max(score, 2)
                except Exception:
                    pass

                if score > best_score:
                    best_score = score
                    best_node = node

            except Exception:
                continue
        return best_node                       

    async def browse_objects(self, node):
        """Outputs the DisplayNames of all direct children of a node."""
        print(f"[{self.name}] Browsing node: {node}")
        for child in await node.get_children():
            display_name = await child.read_display_name()
            print(f"  Child: {child}, DisplayName: {display_name.Text}")
            
 