import asyncio
import os
import json
from asyncua import Client, ua
from asyncua.ua.uatypes import VariantType
from fastapi import WebSocket
from starlette.websockets import WebSocketState

def clear_terminal():
    os.system('cls' if os.name == 'nt' else 'clear')

class SubHandler:
    """
    Handler für OPC UA DataChange-Events, unterstützt verschiedene Modi ("axes", "mode", "custom").
    """
    def __init__(self, name="Client", websocket: WebSocket = None, get_expected_count=None, mode="custom", client=None):
        self.name = name
        self.websocket = websocket
        self.latest_values = {}
        self.last_sent_values = None
        self.get_expected_count = get_expected_count or (lambda: 0)
        self.unit_type = None
        self.mode = mode   
        self.client = client  

    

    @staticmethod
    def encode_eu_to_jsonable(unit):
        try:
            from asyncua import ua
            if isinstance(unit, ua.EUInformation):
                disp = getattr(unit.DisplayName, "Text", str(unit.DisplayName))
                desc = getattr(unit.Description, "Text", str(unit.Description))
                return {
                    "unitId": getattr(unit, "UnitId", None),
                    "namespaceUri": getattr(unit, "NamespaceUri", None),
                    "displayName": disp,
                    "description": desc,
                }
        except Exception:
            pass
        if isinstance(unit, (str, int, float)) or unit is None:
            return unit
        return str(unit)
    
    def reset(self):
        self.latest_values.clear()
        self.last_sent_values = None
        self.unit_type = None

    def datachange_notification(self, node, val, data):
        if self.websocket:
            asyncio.create_task(self._process_datachange(node, val))

    async def _process_datachange(self, node, val):
        try:
            if not self.websocket or self.websocket.client_state != WebSocketState.CONNECTED:
                return

            # Custom: NodeId + Wert
            if self.mode == "custom":
                nodeid_str = node.nodeid.to_string() if hasattr(node, "nodeid") else str(node)
                await self.websocket.send_text(f"x|custom:{json.dumps({'nodeId': nodeid_str, 'value': val})}")
                return

            # Mode: direkt durchreichen
            if self.mode == "mode":
                dn = await node.read_display_name()
                print(f"[Mode-Sub] DataChange: {getattr(dn, 'Text', str(dn))} = {val}")
                await self.websocket.send_text(f"x|Mode:{val}")
                return

            # Axes: Achsname aus der Hierarchie ziehen
            paramset = await node.get_parent()
            axis_node = await paramset.get_parent()
            axis_dn = await axis_node.read_display_name()
            axis_name = getattr(axis_dn, "Text", str(axis_dn))

            # EngineeringUnits nur einmal lesen – robust via Descendant-Suche
            if self.unit_type is None and self.client:
                try:
                    eu_node = await self.client.find_descendant_by_name(node, "EngineeringUnits")
                    if eu_node:
                        self.unit_type = await eu_node.read_value()
                except Exception as e:
                    print(f"[{self.name}] ⚠️ Konnte UnitType nicht auslesen: {e}")
                    self.unit_type = None

            try:
                self.latest_values[axis_name] = float(val)
            except ValueError:
                print(f"[{self.name}] ⚠️ Wert für {axis_name} nicht float-konvertierbar: {val}")
                return

            if len(self.latest_values) >= self.get_expected_count():
                unit_json = SubHandler.encode_eu_to_jsonable(self.unit_type)
                msg = {"angles": self.latest_values, "unit": unit_json}
                print(f"[{self.name}] Achswerte gesammelt: {self.latest_values}")
                await self.websocket.send_text(f"x|angles:{json.dumps(msg)}")

        except Exception as e:
            print(f"[{self.name}] ⚠️ Fehler bei Verarbeitung: {e}")


    def status_change_notification(self, status):
        print(f"[{self.name}] Status changed: {status}")

    def event_notification(self, event):
        try:
            # Extrahiere lesbare Felder
            event_dict = {}
            for field in dir(event):
                if not field.startswith("_") and not callable(getattr(event, field)):
                    val = getattr(event, field)
                    try:
                        event_dict[field] = str(val)
                    except Exception:
                        pass

            print(f"[{self.name}] 📣 New Event Received: {event_dict}")

            # Event an WebSocket senden
            if self.websocket and self.websocket.client_state == WebSocketState.CONNECTED:
                msg = json.dumps(event_dict, default=str)
                asyncio.create_task(self.websocket.send_text(f"x|event:{msg}"))
        except Exception as e:
            print(f"[{self.name}] ❌ Fehler beim Event-Handling: {e}")


class OPCUAClient:
    """
    Stellt eine Verbindung zu einem OPC UA Server her, verwaltet Subscriptions und Methodenaufrufe.
    """
    def __init__(self, url: str, name: str = "Client", websocket: WebSocket = None):
        self.url = url
        self.name = name
        self.client = Client(url)
        self.websocket = websocket

        self.expected_axes_count = 0
        self.sub_handler = SubHandler(name, websocket, lambda: self.expected_axes_count, mode="axes", client=self)
        self.subscription = None

        self.mode_subscription = None
        self.mode_node = None
        self.mode_sub_handler = None
        self.custom_subscriptions = {}

        self.event_subscription = None
        self.event_handle = None

        self.is_robotics_server = False
        self.namespaces: list[str] = []

        self.goto_method_nodeid: str | None = None


        self.running = False

    async def browse_objects(self, node):
        """Gibt die DisplayNames aller direkten Kinder eines Knotens aus."""
        print(f"[{self.name}] Browsing node: {node}")
        for child in await node.get_children():
            display_name = await child.read_display_name()
            print(f"  Child: {child}, DisplayName: {display_name.Text}")

    def _norm(self, s: str | None) -> str:
        return "".join((s or "").lower().split())  # lower + leerzeichen raus

    async def resolve_goto_method(self) -> str | None:
        """
        Sucht eine Method-Node, deren Name wie 'Go To' aussieht (GoTo/Go_To etc.).
        Bevorzugt eine Methode mit Joint-Array als InputArgument.
        """
        candidates_norm = {_norm for _norm in []}  # nur für Typ-Hinweis

        names = ["go to", "goto", "go_to", "go-to"]
        wanted = {self._norm(n) for n in names}

        # Startpunkt: DeviceSet (falls vorhanden), sonst Objects
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

                # Namen lesen
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

                # Muss eine Methode sein
                try:
                    nclass = await node.read_node_class()
                except Exception:
                    nclass = None
                if nclass != ua.NodeClass.Method:
                    for c in await node.get_children():
                        q.append(c)
                    continue

                # Namensmatch?
                norm_names = {self._norm(dn_txt), self._norm(bn_txt)}
                if not (norm_names & wanted):
                    # Kein Namens-Treffer
                    continue

                # Heuristik: bevorzugt Methode mit Joint-Array
                score = 1
                try:
                    ia_node = await node.get_child("0:InputArguments")
                    args = await ia_node.read_value()
                    for a in args or []:
                        aname = (a.Name or "").lower()
                        dtid = getattr(a.DataType, "Identifier", None)
                        vrank = getattr(a, "ValueRank", -1)
                        if ("joint" in aname or "joints" in aname) and vrank == 1:
                            score = 3  # starker Treffer
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

        if best_node:
            self.goto_method_nodeid = best_node.nodeid.to_string()
            return self.goto_method_nodeid
        return None

    

    async def find_descendant_by_name(self, start_node, target_name: str):
        """
        Breitensuche (BFS) ab start_node nach einem Knoten, dessen DisplayName.Text
        ODER BrowseName.Name dem target_name entspricht (case-insensitive).
        Zyklen werden durch 'visited' verhindert.
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
                # Ignoriere fehlerhafte Zweige robust
                continue
        return None





    async def find_child_by_name(self, start_path: list[str], name: str):
        """
        Sucht ab dem Knoten unter start_path rekursiv nach BrowseName.Name == name
        (case-insensitive), zyklenfest.
        """
        try:
            start_node = await self.client.nodes.root.get_child(start_path)
            return await self._search_by_name(start_node, name)
        except Exception as e:
            print(f"[{self.name}] ❌ Fehler bei find_child_by_name: {e}")
            return None

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
                    print(f"[{self.name}] ✅ Gefunden: {bn_name} (Namespace: {uri})")
                    return cur

                for child in await cur.get_children():
                    q.append(child)
            except Exception:
                continue
        return None




    # async def find_child_by_browse_name_recursive(self, start_path: list[str], target_browse_name: str):
    #     """
    #     Durchsucht rekursiv alle Nachfahren eines Startpfads nach einem BrowseName wie '2:SerialNumber'.
    #     """
    #     try:
    #         start_node = await self.client.nodes.root.get_child(start_path)
    #         return await self._search_recursive(start_node, target_browse_name)
    #     except Exception as e:
    #         print(f"[{self.name}] ❌ Fehler beim Startknoten: {e}")
    #         return None

    # async def _search_recursive(self, node, target_browse_name: str):
    #     try:
    #         for child in await node.get_children():
    #             browse_name = await child.read_browse_name()
    #             full_name = f"{browse_name.NamespaceIndex}:{browse_name.Name}"
    #             if full_name == target_browse_name:
    #                 print(f"[{self.name}] ✅ Gefunden: {full_name}")
    #                 return child
    #             found = await self._search_recursive(child, target_browse_name)
    #             if found:
    #                 return found
    #         return None
    #     except Exception as e:
    #         print(f"[{self.name}] ❌ Fehler beim rekursiven Durchsuchen: {e}")
    #         return None

    async def connect(self):
        await self.client.connect()

        ns_array_node = self.client.get_node("i=2255")  # NamespaceArray
        self.namespaces = await ns_array_node.read_value()
        print(f"[{self.name}] Namespaces: {self.namespaces}")

        print(f"[{self.name}] Verbunden mit {self.url}")
        objects = await self.client.nodes.root.get_child(["0:Objects"])
        await self.browse_objects(objects)
        self.running = True
        # Prüfe Robotics Namespace und sende ggf. Robot-Info
        if await self.check_robotics_support():
            try:
                await self.resolve_goto_method()
            except Exception as e:
                print(f"[{self.name}] ⚠️ resolve_goto_method failed: {e}")
            await self.send_robot_info_to_frontend()
        asyncio.create_task(self.run_loop())

    async def run_loop(self):
        while self.running:
            await asyncio.sleep(1)

    async def disconnect(self):
        self.running = False
        if self.subscription:
            await self.subscription.delete()
        await self.client.disconnect()
        print(f"[{self.name}] Verbindung getrennt.")

    async def call_method(self, node_id: str, inputs: dict[str, str]):
        """Dynamischer Methodenaufruf per NodeId und Eingabewerten."""
        try:
            method_node = self.client.get_node(node_id)
            parent_node = await method_node.get_parent()
            input_args = []
            result_dict = {"status": None, "output_arguments": [], "error": None}

            # Input-Argumente einlesen und konvertieren
            try:
                input_arg_node = await method_node.get_child("0:InputArguments")
                input_args_meta = await input_arg_node.read_value()
                for arg in input_args_meta:
                    name = arg.Name or "Unnamed"
                    raw = inputs.get(name, "")
                    vtype = VariantType(arg.DataType.Identifier)
                    is_array = getattr(arg, "ValueRank", None) == 1
                    if raw is None or str(raw).strip() == "":
                        input_args.append(None)
                        continue
                    try:
                        if vtype == VariantType.String:
                            value = str(raw)
                        elif vtype == VariantType.Boolean:
                            value = str(raw).strip().lower() in ["1", "true", "yes", "ja"]
                        elif vtype in (VariantType.Float, VariantType.Double) and not is_array:
                            value = float(raw)
                        elif vtype in (VariantType.Int16, VariantType.Int32, VariantType.Int64,
                                    VariantType.UInt16, VariantType.UInt32, VariantType.UInt64,
                                    VariantType.Byte, VariantType.SByte):
                            value = int(raw)
                        elif vtype == VariantType.ByteString:
                            value = bytes(raw, encoding='utf-8')
                        elif vtype == VariantType.String and arg.ValueRank == 1:
                            value = json.loads(raw)
                        elif is_array:
                            value = json.loads(raw) if isinstance(raw, str) else raw
                        else:
                            value = json.loads(raw)
                    except Exception as e:
                        raise ValueError(f"Ungültige Eingabe für '{name}' (erwartet {vtype}): '{raw}' — {e}")
                    input_args.append(value)
            except Exception:
                pass # No InputArguments

            # Methodenaufruf
            try:
                result = await parent_node.call_method(method_node, *input_args)
                output_args = getattr(result, "OutputArguments", None)
                if output_args and isinstance(output_args, list) and len(output_args) > 0:
                    from asyncua.common.ua_utils import val_to_string
                    result_dict["output_arguments"] = [val_to_string(arg) for arg in output_args]
                elif hasattr(result, "OutputArguments"):
                    pass
                elif result is not None:
                    name = None
                    try:
                        if hasattr(result, 'OutputArguments') and result.OutputArguments:
                            from asyncua.common.ua_utils import val_to_string
                            name = val_to_string(result.OutputArguments[0])
                        elif hasattr(result, 'Name'):
                            name = str(result.Name)
                        elif hasattr(result, 'Value'):
                            name = str(result.Value)
                    except Exception:
                        name = None
                    if name:
                        result_dict["output_arguments"] = [name]
                    else:
                        result_dict["output_arguments"] = [str(result)]
            except Exception as e:
                result_dict["error"] = f"Fehler beim Methodenaufruf: {e}"
                return result_dict

            # Status zurückgeben
            try:
                status = getattr(result, "StatusCode", None)
                if status is not None:
                    result_dict["status"] = str(status)
                else:
                    result_dict["status"] = str(result)
                output_args = getattr(result, "OutputArguments", None)
                if output_args:
                    from asyncua.common.ua_utils import val_to_string
                    result_dict["output_arguments"] = [val_to_string(arg) for arg in output_args]
            except Exception as e:
                print(f"[CALL] Fehler beim Auslesen der OutputArguments: {e}")

            return result

        except Exception as e:
            print(f"[CALL] ❌ Fehler: {e}")
            return {"status": None, "output_arguments": [], "error": f"Fehler beim Methodenaufruf: {e}"}

    async def subscribe_axes_actual_positions(self):
        """Sucht unter DeviceSet → Axes alle Achsen und abonniert deren ActualPosition (robust)."""
        device_set = await self.find_child_by_name(["0:Objects"], "DeviceSet")
        if not device_set:
            print(f"[{self.name}] ⚠️ Kein 'DeviceSet'-Knoten gefunden.")
            return

        axes_node = await self.find_descendant_by_name(device_set, "Axes")
        if not axes_node:
            print(f"[{self.name}] ⚠️ Kein 'Axes'-Knoten gefunden.")
            return

        # Achsen-Kinder sammeln (fallback: alle Kinder nehmen)
        axis_nodes = []
        for child in await axes_node.get_children():
            dn = await child.read_display_name()
            txt = (getattr(dn, "Text", str(dn)) or "").lower()
            if txt.startswith("axis") or txt.startswith("joint") or txt.startswith("ax"):
                axis_nodes.append(child)
        if not axis_nodes:
            axis_nodes = await axes_node.get_children()  # letzter Fallback
        print(f"[{self.name}] {len(axis_nodes)} Achsen gefunden.")

        # Pro Achse: ParameterSet → ActualPosition per robuster Suche
        actual_position_nodes = []
        for axis in axis_nodes:
            try:
                paramset = await self.find_descendant_by_name(axis, "ParameterSet")
                if not paramset:
                    print(f"[{self.name}] ⚠️ Kein ParameterSet unter {axis}")
                    continue
                actual_pos = await self.find_descendant_by_name(paramset, "ActualPosition")
                if actual_pos:
                    actual_position_nodes.append(actual_pos)
                else:
                    print(f"[{self.name}] ⚠️ Keine ActualPosition unter {axis}")
            except Exception as e:
                print(f"[{self.name}] ⚠️ Fehler bei {axis}: {e}")

        if not actual_position_nodes:
            print(f"[{self.name}] ⚠️ Keine ActualPosition-Nodes gefunden.")
            return

        self.expected_axes_count = len(actual_position_nodes)
        self.sub_handler.reset()

        if not self.subscription:
            self.subscription = await self.client.create_subscription(50, self.sub_handler)

        await self.subscription.subscribe_data_change(actual_position_nodes)
        print(f"[{self.name}] ✅ {len(actual_position_nodes)} ActualPosition-Werte abonniert.")


    async def stop_axes_subscription(self):
        """Beendet die Achsposition-Subscription."""
        if self.subscription:
            try:
                await self.subscription.delete()
                print(f"[{self.name}] Joint position stream cancelled.")
            except Exception as e:
                print(f"[{self.name}] ⚠️ Fehler beim Löschen der Subscription: {e}")
        self.subscription = None
        self.sub_handler.reset()

    async def subscribe_mode(self):
        try:
            device_set = await self.find_child_by_name(["0:Objects"], "DeviceSet")
            if not device_set:
                print(f"[{self.name}] ⚠️ Kein 'DeviceSet'-Knoten gefunden.")
                return

            controller = await self.find_descendant_by_name(device_set, "RobotState")
            if not controller:
                print(f"[{self.name}] ⚠️ Kein 'RobotState'-Knoten gefunden.")
                return

            self.mode_node = controller
            if not self.mode_sub_handler:
                self.mode_sub_handler = SubHandler(self.name, self.websocket, mode="mode", client=self)
            if not self.mode_subscription:
                self.mode_subscription = await self.client.create_subscription(50, self.mode_sub_handler)

            await self.mode_subscription.subscribe_data_change(controller)
            print(f"[{self.name}] ✅ Mode-Node abonniert: {controller}")

        except Exception as e:
            print(f"[{self.name}] ❌ Fehler beim Subscriben von Mode: {e}")


    async def stop_mode_subscription(self):
        """Beendet explizit die Mode-Subscription."""
        try:
            if self.mode_subscription:
                await self.mode_subscription.delete()
                print(f"[{self.name}] ❌ Mode-Subscription gestoppt.")
        except Exception as e:
            print(f"[{self.name}] ⚠️ Fehler beim Löschen der Mode-Subscription: {e}")
        self.mode_subscription = None
        self.mode_node = None
        if self.mode_sub_handler:
            self.mode_sub_handler.reset()

    async def subscribe_custom(self, node_id, websocket):
        """
        Erstellt eine Subscription auf ein beliebiges NodeId.
        """
        node = self.client.get_node(node_id)
        handler = SubHandler(self.name, websocket, mode="custom", client=self)
        subscription = await self.client.create_subscription(50, handler)
        await subscription.subscribe_data_change(node)
        self.custom_subscriptions[node_id] = subscription
        return subscription

    async def unsubscribe_custom(self, node_id: str):
        """
        Entfernt (löscht) eine Custom-Subscription für eine bestimmte NodeId.
        """
        try:
            if node_id in self.custom_subscriptions:
                subscription = self.custom_subscriptions[node_id]
                await subscription.delete()
                del self.custom_subscriptions[node_id]
                print(f"[{self.name}] ✅ Custom-Subscription entfernt für NodeId {node_id}")
                return True
            else:
                print(f"[{self.name}] ⚠️ Keine Custom-Subscription für NodeId {node_id} gefunden")
                return False
        except Exception as e:
            print(f"[{self.name}] ❌ Fehler beim Entfernen der Custom-Subscription für NodeId {node_id}: {e}")
            return False
        

    async def subscribe_events_on_node(self, node_id: str):
        """
        Abonniert Events auf einem konkreten Node.
        """
        try:
            node = self.client.get_node(node_id)
            handler = SubHandler(self.name, self.websocket, mode="event", client=self)
            subscription = await self.client.create_subscription(100, handler)
            handle = await subscription.subscribe_events(node)

            self.event_subscription = subscription
            self.event_handle = handle

            print(f"[{self.name}] ✅ Event subscription on node {node_id} active.")
            return True
        except Exception as e:
            print(f"[{self.name}] ❌ Error subscribing to events on node {node_id}: {e}")
            return False

    async def unsubscribe_events(self):
        try:
            if self.event_subscription and self.event_handle:
                await self.event_subscription.unsubscribe(self.event_handle)
                await self.event_subscription.delete()
                print(f"[{self.name}] ✅ Event subscription removed.")
                self.event_subscription = None
                self.event_handle = None
                return True
            return False
        except Exception as e:
            print(f"[{self.name}] ❌ Error removing event subscription: {e}")
            return False
        


    async def check_robotics_support(self) -> bool:
        """Prüft, ob 'http://opcfoundation.org/UA/Robotics/' im NamespaceArray enthalten ist."""
        try:
            server_array_node = self.client.get_node("i=2255")  # NamespaceArray
            values = await server_array_node.read_value()
            self.is_robotics_server = "http://opcfoundation.org/UA/Robotics/" in values
            return self.is_robotics_server
        except Exception as e:
            print(f"[check_robotics_support] Fehler: {e}")
            self.is_robotics_server = False
            return False

    async def send_robot_info_to_frontend(self):
        """
        Liest Manufacturer, Model und SerialNumber aus dem Server und sendet sie an das Frontend.
        """
        try:
            man_val = await self.read_manufacturer()
            model_val = await self.read_model()
            serial_val = await self.read_serial_number()

            msg = json.dumps({
                "manufacturer": man_val,
                "model": model_val,
                "serialNumber": serial_val,
                "gotoMethodNodeId": self.goto_method_nodeid
            })

            if self.websocket and self.websocket.client_state == WebSocketState.CONNECTED:
                await self.websocket.send_text(f"x|robotinfo:{msg}")
            print(f"[{self.name}] ✅ Robot info sent: {msg}")

        except Exception as e:
            print(f"[{self.name}] ❌ Fehler beim Senden von Robot-Info: {e}")


    async def read_model(self) -> str:
        """Liest den Model-Knoten robust aus."""
        if not self.is_robotics_server:
            return "Not a robotics server"
        try:
            device_set = await self.find_child_by_name(["0:Objects"], "DeviceSet")
            if not device_set:
                return "None"
            node = await self.find_descendant_by_name(device_set, "Model")
            
            if node:
                val = await node.read_value()
                return val.Text if hasattr(val, 'Text') else str(val)
            return "None"
        except Exception as e:
            return f"❌ Model read error: {e}"

    async def read_serial_number(self) -> str:
        """Liest die Seriennummer robust aus."""
        if not self.is_robotics_server:
            return "Not a robotics server"
        try:
            device_set = await self.find_child_by_name(["0:Objects"], "DeviceSet")
            if not device_set:
                return "None"
            node = await self.find_descendant_by_name(device_set, "SerialNumber")
            if node:
                val = await node.read_value()
                return val.Text if hasattr(val, 'Text') else str(val)
            return "None"
        except Exception as e:
            return f"❌ SerialNumber read error: {e}"


    async def read_manufacturer(self) -> str:
        """Liest den Manufacturer-Knoten robust aus."""
        if not self.is_robotics_server:
            return "Not a robotics server"
        try:
            device_set = await self.find_child_by_name(["0:Objects"], "DeviceSet")
            if not device_set:
                return "None"
            node = await self.find_descendant_by_name(device_set, "Manufacturer")
            if node:
                val = await node.read_value()
                return val.Text if hasattr(val, 'Text') else str(val)
            return "None"
        except Exception as e:
            return f"❌ Manufacturer read error: {e}"


