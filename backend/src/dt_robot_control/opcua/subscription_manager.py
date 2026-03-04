"""Subscription manager for OPC UA streams and custom subscriptions."""

from fastapi import WebSocket
from dt_robot_control.opcua.subhandler import SubHandler
from dt_robot_control.opcua.node_manager import NodeManager

class SubscriptionManager:
    """Manages OPC UA subscriptions for the client.

    Split out from the earlier OPC UA WebSocket handler so streaming (axes, mode, events) is
    isolated from transport code and can be reused/tested independently.
    """

    def __init__(self, opcua_client, name: str = "Client", websocket: WebSocket = None):
        """Initialize the subscription manager.

        Args:
            opcua_client: OPCUAClient wrapper instance.
            name (str): Client name.
            websocket (WebSocket | None): Optional websocket to stream updates to.
        """

        self.opcua_client = opcua_client
        self.client = opcua_client.client   # asyncua.Client
        self.name = name
        self.url = opcua_client.url
        self.websocket = websocket

        self.node_manager = NodeManager(opcua_client)
        self.expected_axes_count = 0

        self.sub_handler = SubHandler(name, self.url, self.websocket, lambda: self.expected_axes_count, mode="axes", node_manager = self.node_manager)

        self.subscription = None

        self.mode_subscription = None
        self.mode_node = None
        self.mode_sub_handler = None
        self.custom_subscriptions = {}

        self.event_subscription = None
        self.event_handle = None

    async def subscribe_axes_actual_positions(self):
        """Search for all axes under DeviceSet → Axes and subscribe to ActualPosition values.

        Returns:
            None
        """
        device_set = await self.node_manager.find_child_by_name(["0:Objects"], "DeviceSet")
        if not device_set:
            print(f"[{self.url}] ⚠️ No ‘DeviceSet’ node found.")
            return

        axes_node = await self.node_manager.find_descendant_by_name(device_set, "Axes")
        if not axes_node:
            print(f"[{self.url}] ⚠️ No ‘Axes’ node found.")
            return

        axis_nodes = []
        for child in await axes_node.get_children():
            dn = await child.read_display_name()
            txt = (getattr(dn, "Text", str(dn)) or "").lower()
            if txt.startswith("axis") or txt.startswith("joint") or txt.startswith("ax"):
                axis_nodes.append(child)
        if not axis_nodes:
            axis_nodes = await axes_node.get_children()  
        print(f"[{self.url}] {len(axis_nodes)} Axles found.")

        actual_position_nodes = []
        for axis in axis_nodes:
            try:
                paramset = await self.node_manager.find_descendant_by_name(axis, "ParameterSet")
                if not paramset:
                    print(f"[{self.url}] ⚠️ No parameter set under {axis}")
                    continue
                actual_pos = await self.node_manager.find_descendant_by_name(paramset, "ActualPosition")
                if actual_pos:
                    actual_position_nodes.append(actual_pos)
                else:
                    print(f"[{self.url}] ⚠️ No ActualPosition under {axis}")
            except Exception as e:
                print(f"[{self.url}] ⚠️ Error for {axis}: {e}")

        if not actual_position_nodes:
            print(f"[{self.url}] ⚠️ No ActualPosition-Nodes found.")
            return

        self.expected_axes_count = len(actual_position_nodes)
        self.sub_handler.reset()

        if not self.subscription:
            self.subscription = await self.client.create_subscription(50, self.sub_handler)

        await self.subscription.subscribe_data_change(actual_position_nodes)
        print(f"[{self.url}] ✅ {len(actual_position_nodes)} ActualPosition values subscribed.")


    async def stop_axes_subscription(self):
        """End the axis position subscription.

        Returns:
            None
        """
        if self.subscription:
            try:
                await self.subscription.delete()
                print(f"[{self.url}] Joint position stream cancelled.")
            except Exception as e:
                print(f"[{self.url}] ⚠️ Error deleting subscription: {e}")
        self.subscription = None
        self.sub_handler.reset()

    async def subscribe_mode(self):
        """Subscribe to the RobotState mode node and stream updates.

        Returns:
            None
        """
        try:
            device_set = await self.node_manager.find_child_by_name(["0:Objects"], "DeviceSet")
            if not device_set:
                print(f"[{self.url}] ⚠️ No ‘DeviceSet’ node found.")
                return

            controller = await self.node_manager.find_descendant_by_name(device_set, "RobotState")
            if not controller:
                print(f"[{self.url}] ⚠️ No ‘RobotState’ node found.")
                return

            self.mode_node = controller
            if not self.mode_sub_handler:
                self.mode_sub_handler = SubHandler(self.name, self.url, self.websocket, mode="mode", node_manager = self.node_manager)
            if not self.mode_subscription:
                self.mode_subscription = await self.client.create_subscription(50, self.mode_sub_handler)

            await self.mode_subscription.subscribe_data_change(controller)
            print(f"[{self.url}] ✅ Mode-Node subscribed: {controller}")

        except Exception as e:
            print(f"[{self.url}] ❌ Error subscribing to Mode: {e}")


    async def stop_mode_subscription(self):
        """Explicitly terminate the mode subscription.

        Returns:
            None
        """
        try:
            if self.mode_subscription:
                await self.mode_subscription.delete()
                print(f"[{self.url}] ❌ Mode-Subscription stopped.")
        except Exception as e:
            print(f"[{self.url}] ⚠️ Error deleting fashion subscription: {e}")
        self.mode_subscription = None
        self.mode_node = None
        if self.mode_sub_handler:
            self.mode_sub_handler.reset()

    async def subscribe_custom(self, node_id, websocket):
        """
        Creates a subscription to any NodeId.

        Args:
            node_id (str): NodeId string.
            websocket (WebSocket): WebSocket to send updates to.

        Returns:
            object: Created subscription instance.
        """
        node = self.client.get_node(node_id)
        handler = SubHandler(self.name, self.url, websocket, mode="custom", node_manager = self.node_manager)
        subscription = await self.client.create_subscription(50, handler)
        await subscription.subscribe_data_change(node)
        self.custom_subscriptions[node_id] = subscription
        return subscription

    async def unsubscribe_custom(self, node_id: str):
        """
        Removes (deletes) a custom subscription for a specific NodeId.

        Args:
            node_id (str): NodeId string.

        Returns:
            bool: True if removed, False otherwise.
        """
        try:
            if node_id in self.custom_subscriptions:
                subscription = self.custom_subscriptions[node_id]
                await subscription.delete()
                del self.custom_subscriptions[node_id]
                print(f"[{self.url}] ✅ Custom subscription removed for NodeId {node_id}")
                return True
            else:
                print(f"[{self.url}] ⚠️ No custom subscription found for NodeId {node_id}")
                return False
        except Exception as e:
            print(f"[{self.url}] ❌ Error removing custom subscription for NodeId {node_id}: {e}")
            return False
        

    async def subscribe_events_on_node(self, node_id: str):
        """
        Subscribe to events on a specific node.

        Args:
            node_id (str): NodeId string.

        Returns:
            bool: True if subscription was created, else False.
        """
        try:
            node = self.client.get_node(node_id)
            handler = SubHandler(self.name, self.url, self.websocket, mode="event", node_manager = self.node_manager)
            subscription = await self.client.create_subscription(100, handler)
            handle = await subscription.subscribe_events(node)

            self.event_subscription = subscription
            self.event_handle = handle

            print(f"[{self.url}] ✅ Event subscription on node {node_id} active.")
            return True
        except Exception as e:
            print(f"[{self.url}] ❌ Error subscribing to events on node {node_id}: {e}")
            return False

    async def unsubscribe_events(self):
        """Unsubscribe from the active events subscription, if any.

        Returns:
            bool: True if removed, False otherwise.
        """
        try:
            if self.event_subscription and self.event_handle:
                await self.event_subscription.unsubscribe(self.event_handle)
                await self.event_subscription.delete()
                print(f"[{self.url}] ✅ Event subscription removed.")
                self.event_subscription = None
                self.event_handle = None
                return True
            return False
        except Exception as e:
            print(f"[{self.url}] ❌ Error removing event subscription: {e}")
            return False
