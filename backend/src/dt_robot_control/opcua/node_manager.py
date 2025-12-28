from collections import deque
from asyncua import ua


class NodeManager:
    """
    Provides utilities for browsing and searching nodes in an OPC UA address space.
    """

    def __init__(self, opcua_client):
        """
        Initializes the NodeManager.

        Args:
            opcua_client: A Wrapper object that encapsulates an asyncua.Client instance and
                exposes client metadata such as name and namespaces.
        """

        self.opcua_client = opcua_client              # wrapper
        self.client = opcua_client.client      # asyncua.Client

        self.name = opcua_client.name

    # utilities
    def _norm(self, s: str | None) -> str:
        """
        Normalizes a string for name comparison to be case-insensitive and whitespace-insensitive.

        Args:
            s (str | None): Input string. If None, it is treated as an empty string.

        Returns:
            str: Normalized string. Empty string if input is None.
        """

        return "".join((s or "").lower().split()) 

    # traversal

    async def _bfs(self, start_node):
        """
        Provides a breadth-first traversal of the address space starting from a given node.

        The method as an async generator that yields nodes in BFS order. This means that they are
        yielded in the order they are discovered during the traversal and returned one by one.

        Furthermore, it prevents cycles by keeping track of visited nodes.

        Args:
            start_node: The node from which the BFS traversal begins.

        Yields:
            Nodes in BFS order starting from start_node. They are yielded one by one as they are discovered.
        
        Raises:
            Exception: If a node properties or the children can't be read, then the error is logged, the node skipped and we continue the traversal.
        """
        queue = deque([start_node])
        visited = set()

        while queue:
            node = queue.popleft()
            try:
                nid = node.nodeid.to_string()
                if nid in visited:
                    continue
                visited.add(nid)

            except Exception as e:
                print(f"[{self.name}] ❌ NodeId error: {e}")
                continue

            yield node
            try:
                children = await node.get_children()
            except Exception as e:
                print(f"[{self.name}] ❌ Cannot browse children of {node}: {e}")
                continue

            for child in children:
                queue.append(child)

    async def find_descendant_by_name(self, start_node, target_name: str):
        """
        Searches for a descendant node by DisplayName or BrowseName.

        It first normalizes the target name for case-insensitive comparison.
        Then it performs a breadth-first search (BFS) starting from the given node until it matches either DispolayName.Text 
        or BrowseName.Name with the target name.

        Args:
            start_node: The node from which the search begins.
            target_name (str): The name to search for. It is case-insensitive.

        Returns:
            The first matching descendant node if found, else None.
        """

        target = self._norm(target_name)
        if not target:
            return None

        async for node in self._bfs(start_node):
            # DisplayName
            try:
                dn = await node.read_display_name()
                dn_txt = self._norm(getattr(dn, "Text", str(dn)) or "")
            except Exception:
                dn_txt = ""

            # BrowseName
            try:
                bn = await node.read_browse_name()
                bn_name = self._norm(getattr(bn, "Name", "") or "")
            except Exception:
                bn_name = ""

            if dn_txt == target or bn_name == target:
                return node
        return None
        
    async def _find_by_browse_name(self, start_node, target_name: str):
        """
        Searches for a descendant node by BrowseName only using BFS.

        The target name is normalized for robust comparison. It traverses the address space starting from a given node
        and matches nodes based on their BrowseName.Name against the target name.

        Args:
            start_node: The node from which the search begins.
            target_name (str): The name to search for. It is case-insensitive.

        Returns:
            The first matching node if found, else None.
        """

        target = self._norm(target_name)

        if not target:
            return None
        
        async for node in self._bfs(start_node):

            try:
                bn = await node.read_browse_name()
                bn_name = self._norm(getattr(bn, "Name", "") or "")
            except Exception:
                bn_name = ""

            if bn_name == target:
                uri = None
                if bn.NamespaceIndex < len(self.opcua_client.namespaces):
                    uri = self.opcua_client.namespaces[bn.NamespaceIndex]

                print(f"[{self.name}] ✅ Found: {bn_name} (Namespace: {uri})")
                return node
            
        return None

    
    async def find_child_by_name(self, start_path: list[str], name: str):
        """
        Searches for a child node under a give path by BrowseName.

        This method navigates to the node specified by start_path and then searches its descendants
        for a node with the given name using BFS. 
        It is case-insensitive and cycle-proof.

        Args:
            start_path (list[str]): The path to the starting node as a list of strings.
            name (str): The name of the wanted child node.

        Returns:
            The first matching child node if found, else None.
        """

        try:
            start_node = await self.client.nodes.root.get_child(start_path)
            return await self._find_by_browse_name(start_node, name)
        except Exception as e:
            print(f"[{self.name}] ❌ Error in find_child_by_name: {e}")
            return None
    

    async def find_method_by_names(self, name_variants: list[str], return_score=False):
        """
        Searches for a Method node by either a DisplayName or BrowseName that matches any of the provided names in the list.

        Scoring:
        ( -1 points: No match)
        - 1 point: Name match
        - 2 points: Above and the method has a 1 Dim. array as an input argument that is either Float or Double
        - 3 points: Above and the the 1 Dim. array argument name contains "joint" or "joints"

        Args:
            name_variants (list[str]): List of possible names for the method.
            return_score (bool): Whether to return the score along with the node.
        
        Returns:
            The highest scoring Method node if found, else None. If return_score is True, returns a tuple of the node and its score.
        """

        wanted = {self._norm(n) for n in name_variants}
        
        start = await self.find_child_by_name(["0:Objects"], "DeviceSet")
        if not start:
            start = await self.client.nodes.root.get_child(["0:Objects"])

        best_node = None
        best_score = -1

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
        if return_score:
            return best_node, best_score
        return best_node
                    

    async def browse_objects(self, node):
        """
        Outputs the DisplayNames of all direct children of a node.
        
        Args:
            node: The node whose children will be listed.
        
        Returns:
            None
        """

        print(f"[{self.name}] Browsing node: {node}")
        for child in await node.get_children():
            try:
                display_name = await child.read_display_name()
                print(f"  Child: {child}, DisplayName: {display_name.Text}")
            except Exception:
                continue        
 