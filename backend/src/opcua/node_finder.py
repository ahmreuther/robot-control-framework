class NodeManager:
    """Manages OPC UA node operations for the client."""

    @staticmethod
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




    @staticmethod
    async def find_child_by_name(self, start_path: list[str], name: str):
        """
        Search recursively from the node under start_path for BrowseName.Name == name
        (case-insensitive), cycle-proof.
        """
        try:
            start_node = await self.client.nodes.root.get_child(start_path)
            return await self._search_by_name(start_node, name)
        except Exception as e:
            print(f"[{self.name}] ❌ Error in find_child_by_name: {e}")
            return None
        

    @staticmethod
    async def _search_by_name(self, node, target_name: str):
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