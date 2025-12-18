# opcua_client.py

import asyncio
import os
import json
from asyncua import Client, ua, Node
from asyncua.ua.uatypes import VariantType
from fastapi import WebSocket
from starlette.websockets import WebSocketState
from .subscription_manager import SubscriptionManager
from .node_manager import NodeManager


def clear_terminal():
    os.system('cls' if os.name == 'nt' else 'clear')

class OPCUAClient:
    """
    Application-level wrapper around `asyncua.Client`.

    Responsibilities:
      - Manage connection lifecycle (connect/disconnect) and basic session state.
      - Cache server metadata (NamespaceArray) and detect OPC UA Robotics support.
      - Provide robotics-specific helpers (read manufacturer/model/serial, discover method NodeIds).
      - Offer a dynamic method-call helper that converts string inputs to OPC UA argument types.
      - Compose and expose helper managers:
          - SubscriptionManager: subscription lifecycle + streaming setup
          - NodeManager: address-space navigation helpers
      - Optionally push selected information to a FastAPI WebSocket using the app's message format.
      ~gpt
    """

    
    name: str
    url: str
    client: Client      # asyncua.Client
    websocket: WebSocket
    is_robotics_server:bool
    namespaces: list[str]

    goto_method_nodeid: str | None            # wtf is this shit
    toggle_endeff_method_nodeid: str | None    # this too

    # managers
    subscription_manager: SubscriptionManager
    node_manager: NodeManager

    running: bool

    

    def __init__(
            self, url: str, 
            name: str = "Client", 
            websocket: WebSocket = None
            ):
        self.name = name
        self.url = url
        # asyncua.Client instance
        self.client = Client(url) # todo: error if renamed when connected to evo demo server
        self.websocket = websocket

        self.goto_method_nodeid: str | None = None
        self.toggle_endeff_method_nodeid: str | None = None

        self.is_robotics_server = False
        self.namespaces= []

        

        # Initialize managers
        self.subscription_manager = SubscriptionManager(self, name, websocket)
        self.node_manager = NodeManager(self)
        self.running = False

    async def connect(self):
        """
            Connect to `asyncua.Client`.

            Responsibilities:
                - Gets namespace-array from `asyncua_client` and assigns it to local array `namespaces`.
                - Prints all child nodes of "OPC UA RootFolder"-Node.
                - Resolves `goto`-method & `toggle_endeff`-method
                - Starts infinite run loop, awaiting orders or sth

            Raises:
                Exception: If `goto`-method could not be resolved
                Exception: If `toggle_endeff`-method could not be resolved 
            
        """
        await self.client.connect()
        
        # Getting NamespaceArray variable via standard NodeId `ua.ObjectsIds.Server_NamespaceArray`,
        # which is a constant with int value 2255.
        nsarr_node: Node = self.client.get_node(ua.ObjectIds.Server_NamespaceArray)
        self.namespaces: list[str] = await nsarr_node.read_value()
        print(f"[{self.name}] Namespaces: {self.namespaces}")

        print(f"[{self.name}] Connected to {self.url}")
        # Getting child of root-node with browse name `Objects` and namespace index `0`.
        # Node `objects_node` is the standard OPC UA folder also called "RootFolder" / "Objects".
        objects_node:Node = await self.client.nodes.root.get_child(["0:Objects"])
        # Print DisplayNames of all direct children of `objects_node`.
        await self.node_manager.browse_objects(objects_node)
        
        self.running = True
        
        # Check the robotics namespace, resolving `goto` & `toggle_endeff` methods.
        # Send robot info if necessary (jp: i think on success).
        if await self.has_robotics_namespace():
            try:
                await self.resolve_goto_method()
            except Exception as e:
                print(f"[{self.name}] ERROR: resolve_goto_method failed: {e}")
            try:
                await self.resolve_toggle_endeff_method()
            except Exception as e:
                print(f"[{self.name}] ERROR: resolve_toggle_endeff_method failed: {e}")
            await self.send_robot_info_to_frontend()
        asyncio.create_task(self.run_loop())    


    async def run_loop(self):
        while self.running:
            await asyncio.sleep(1)

    async def disconnect(self):
        self.running = False
        if self.subscription_manager.subscription:
            await self.subscription_manager.subscription.delete()
        await self.client.disconnect()
        print(f"[{self.name}] Connection lost.")

    async def call_method(self, node_id: str, inputs: dict[str, str]):
        """Dynamic method call via NodeId and input values."""
        try:
            method_node = self.client.get_node(node_id)
            parent_node = await method_node.get_parent()
            input_args = []
            result_dict = {"status": None, "output_arguments": [], "error": None}

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
                result_dict["error"] = f"Error when calling method:{e}"
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
                print(f"[CALL] Error reading OutputArguments: {e}")

            return result

        except Exception as e:
            print(f"[CALL] ❌ Fehler: {e}")
            return {"status": None, "output_arguments": [], "error": f"Error when calling method: {e}"}

    async def has_robotics_namespace(self) -> bool:
        """Checks whether ‘http://opcfoundation.org/UA/Robotics/’ is contained in the NamespaceArray."""
        try:
            server_array_node = self.client.get_node("i=2255")  # NamespaceArray
            values = await server_array_node.read_value()
            self.is_robotics_server = "http://opcfoundation.org/UA/Robotics/" in values
            return self.is_robotics_server
        except Exception as e:
            print(f"[has_robotics_namespace] Error: {e}")
            self.is_robotics_server = False
            return False

    async def send_robot_info_to_frontend(self):
        """
        Reads Manufacturer, Model, and SerialNumber from the server and sends them to the frontend.
        """
        try:
            man_val = await self.read_manufacturer()
            model_val = await self.read_model()
            serial_val = await self.read_serial_number()

            msg = json.dumps({
                "manufacturer": man_val,
                "model": model_val,
                "serialNumber": serial_val,
                "gotoMethodNodeId": self.goto_method_nodeid,
                "toggleEndEffMethodNodeId": self.toggle_endeff_method_nodeid
            })

            if self.websocket and self.websocket.client_state == WebSocketState.CONNECTED:
                await self.websocket.send_text(f"x|robotinfo:{msg}")
            print(f"[{self.name}] ✅ Robot info sent: {msg}")

        except Exception as e:
            print(f"[{self.name}] ❌ Error sending robot info: {e}")

    async def read_model(self) -> str:
        """Reads the model node robustly."""
        if not self.is_robotics_server:
            return "Not a robotics server"
        try:
            device_set = await self.node_manager.find_child_by_name(["0:Objects"], "DeviceSet")
            if not device_set:
                return "None"
            node = await self.node_manager.find_descendant_by_name(device_set, "Model")
            
            if node:
                val = await node.read_value()
                return val.Text if hasattr(val, 'Text') else str(val)
            return "None"
        except Exception as e:
            return f"❌ Model read error: {e}"

    async def read_serial_number(self) -> str:
        """Reads the serial number reliably."""
        if not self.is_robotics_server:
            return "Not a robotics server"
        try:
            device_set = await self.node_manager.find_child_by_name(["0:Objects"], "DeviceSet")
            if not device_set:
                return "None"
            node = await self.node_manager.find_descendant_by_name(device_set, "SerialNumber")
            if node:
                val = await node.read_value()
                return val.Text if hasattr(val, 'Text') else str(val)
            return "None"
        except Exception as e:
            return f"❌ SerialNumber read error: {e}"

    async def read_manufacturer(self) -> str:
        """Reads the manufacturer node reliably."""
        if not self.is_robotics_server:
            return "Not a robotics server"
        try:
            device_set = await self.node_manager.find_child_by_name(["0:Objects"], "DeviceSet")
            if not device_set:
                return "None"
            node = await self.node_manager.find_descendant_by_name(device_set, "Manufacturer")
            if node:
                val = await node.read_value()
                return val.Text if hasattr(val, 'Text') else str(val)
            return "None"
        except Exception as e:
            return f"❌ Manufacturer read error: {e}"

    async def resolve_toggle_endeff_method(self) -> str | None:
        """
        Searches for a method node whose name looks like ‘Go To’ (GoTo/Go_To etc.).
        Prefer a method with a joint array as input argument.
        """
        names = ["EndEffSkill","toggleEndEff", "toggle_end_eff", "toggleEndEffector", "toggleendeffector"]
        best_node = await self.node_manager.find_method_by_names(names)
        
        if best_node:
            self.toggle_endeff_method_nodeid = best_node.nodeid.to_string()
            return self.toggle_endeff_method_nodeid
        return None
    
    async def resolve_goto_method(self) -> str | None:
        """
        Searches for a method node whose name looks like ‘Go To’ (GoTo/Go_To etc.).
        Prefer a method with a joint array as input argument.
        """

        names = ["JointPTPMoveSkill","go to", "goto", "go_to", "go-to", "Go To"]
        
        best_node = await self.node_manager.find_method_by_names(names)

        if best_node:
            self.goto_method_nodeid = best_node.nodeid.to_string()
            return self.goto_method_nodeid
        return None
