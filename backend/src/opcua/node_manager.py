from collections import deque
from asyncua import ua


class NodeManager:
    """
    Responsible for browsing and searching OPC UA nodes.
    """

    def __init__(self, opcua_client):
        self.opcua_client = opcua_client              # wrapper
        self.asyncua_client = opcua_client.client      # asyncua.Client

        self.namespaces = opcua_client.namespaces
        self.name = opcua_client.name

    # utilities
    def _norm(self, s: str | None) -> str:
        return "".join((s or "").lower().split()) 

    # traversal

    async def _bfs(self, start_node):
        queue = deque([start_node])
        visited = set()
        while queue:
            node = queue.popleft()
            try:
                nid = node.nodeid.to_string()
                if nid in visited:
                    continue
                visited.add(nid)

                yield node

                for child in await node.get_children():
                    queue.append(child)

            except Exception:
                continue

    async def find_descendant_by_name(self, start_node, target_name: str):
        """
        Broad search (BFS) from start_node for a node whose DisplayName.Text
        OR BrowseName.Name matches target_name (case-insensitive).
        Cycles are prevented by ‘visited’.
        """
        target = (target_name or "").strip().lower()
        if not target:
            return None

        async for node in self._bfs(start_node):
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
        return None
        
    async def _find_by_browse_name(self, start_node, target_name: str):
        "helper method"
        target = (target_name or "").strip().lower()
        if not target:
            return None
        
        async for node in self._bfs(start_node):

            try:
                bn = await node.read_browse_name()
                bn_name = getattr(bn, "Name", "") or ""
            except Exception:
                bn_name = ""

            if bn_name.lower() == target:
                uri = None
                if bn.NamespaceIndex < len(self.namespaces):
                    uri = self.namespaces[bn.NamespaceIndex]

                print(f"[{self.name}] ✅ Found: {bn_name} (Namespace: {uri})")
                return node
            
        return None

    
    async def find_child_by_name(self, start_path: list[str], name: str):
        """
        Search recursively from the node under start_path for BrowseName.Name == name
        (case-insensitive), cycle-proof.
        """
        try:
            start_node = await self.asyncua_client.nodes.root.get_child(start_path)
            return await self._find_by_browse_name(start_node, name)
        except Exception as e:
            print(f"[{self.name}] ❌ Error in find_child_by_name: {e}")
            return None
    

    async def find_method_by_names(self, name_variants: list[str]):
        wanted = {self._norm(n) for n in name_variants}
        
        start = await self.find_child_by_name(["0:Objects"], "DeviceSet")
        if not start:
            start = await self.client.nodes.root.get_child(["0:Objects"])
    
        async for node in self._bfs(start):

            try:
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
            try:
                display_name = await child.read_display_name()
                print(f"  Child: {child}, DisplayName: {display_name.Text}")
            except Exception:
                continue        
 