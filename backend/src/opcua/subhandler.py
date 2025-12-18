import asyncio
import json
from fastapi import WebSocket
from starlette.websockets import WebSocketState


class SubHandler:
    """
       Handler for OPC UA DataChange events, supports various modes (“axes,” “mode,” “custom”).
    """
    def __init__(self, name="Client", websocket: WebSocket = None, get_expected_count=None, mode="custom", node_manager=None):
        self.name = name
        self.websocket = websocket
        self.latest_values = {}
        self.last_sent_values = None
        self.get_expected_count = get_expected_count or (lambda: 0)
        self.unit_type = None
        self.mode = mode   
        self.node_manager = node_manager
    

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

            if self.mode == "custom":
                nodeid_str = node.nodeid.to_string() if hasattr(node, "nodeid") else str(node)
                await self.websocket.send_text(f"x|custom:{json.dumps({'nodeId': nodeid_str, 'value': val})}")
                return

            if self.mode == "mode":
                dn = await node.read_display_name()
                print(f"[Mode-Sub] DataChange: {getattr(dn, 'Text', str(dn))} = {val}")
                await self.websocket.send_text(f"x|Mode:{val}")
                return

            paramset = await node.get_parent()
            axis_node = await paramset.get_parent()
            axis_dn = await axis_node.read_display_name()
            axis_name = getattr(axis_dn, "Text", str(axis_dn))

            if self.unit_type is None and self.node_manager:
                try:
                    eu_node = await self.node_manager.find_descendant_by_name(node, "EngineeringUnits")
                    if eu_node:
                        self.unit_type = await eu_node.read_value()
                except Exception as e:
                    print(f"[{self.name}] ⚠️ Could not read UnitType: {e}")
                    self.unit_type = None

            try:
                self.latest_values[axis_name] = float(val)
            except ValueError:
                print(f"[{self.name}] ⚠️ Value for {axis_name} cannot be converted to float: {val}")
                return

            if len(self.latest_values) >= self.get_expected_count():
                unit_json = SubHandler.encode_eu_to_jsonable(self.unit_type)
                msg = {"angles": self.latest_values, "unit": unit_json}
                print(f"[{self.name}] Axle values collected: {self.latest_values}")
                await self.websocket.send_text(f"x|angles:{json.dumps(msg)}")

        except Exception as e:
            print(f"[{self.name}] ⚠️ Processing error: {e}")


    def status_change_notification(self, status):
        print(f"[{self.name}] Status changed: {status}")

    def event_notification(self, event):
        try:
            event_dict = {}
            for field in dir(event):
                if not field.startswith("_") and not callable(getattr(event, field)):
                    val = getattr(event, field)
                    try:
                        event_dict[field] = str(val)
                    except Exception:
                        pass

            print(f"[{self.name}] 📣 New Event Received: {event_dict}")

            if self.websocket and self.websocket.client_state == WebSocketState.CONNECTED:
                msg = json.dumps(event_dict, default=str)
                asyncio.create_task(self.websocket.send_text(f"x|event:{msg}"))
        except Exception as e:
            print(f"[{self.name}] ❌ Error in event handling: {e}")

