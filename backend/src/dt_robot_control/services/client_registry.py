"""
Client Registry Service

Centralized management of OPC UA client connections.
"""

from typing import Dict, Optional
from dt_robot_control.opcua.opcua_client import OPCUAClient


class ClientRegistry:
    """Manages OPC UA client connections across the application.
    
    This service ensures that both WebSocket handlers
    and REST endpoints access the same client instances.
    """
    
    def __init__(self):
        """Initialize empty client registry."""
        self._clients: Dict[str, OPCUAClient] = {}
    
    def add(self, url: str, client: OPCUAClient) -> None:
        """Add a client to the registry.
        
        Args:
            url (str): OPC UA server URL (used as key).
            client (OPCUAClient): OPCUAClient instance.
        """
        self._clients[url] = client
    
    def get(self, url: str) -> Optional[OPCUAClient]:
        """Get a client by URL.
        
        Args:
            url (str): OPC UA server URL.
            
        Returns:
            OPCUAClient | None: Client instance or None if not found.
        """
        return self._clients.get(url)
    
    def remove(self, url: str) -> bool:
        """Remove a client from the registry.
        
        Args:
            url (str): OPC UA server URL.
            
        Returns:
            bool: True if client was removed, False if not found.
        """
        if url in self._clients:
            del self._clients[url]
            return True
        return False
    
    def has(self, url: str) -> bool:
        """Check if a client exists in the registry.
        
        Args:
            url (str): OPC UA server URL.
            
        Returns:
            bool: True if client exists, False otherwise.
        """
        return url in self._clients
    
    def all(self) -> Dict[str, OPCUAClient]:
        """Get all registered clients.
        
        Returns:
            Dict[str, OPCUAClient]: Dictionary of all clients.
        """
        return self._clients.copy()
    
    def clear(self) -> None:
        """Remove all clients from the registry."""
        self._clients.clear()


# Global singleton instance
client_registry = ClientRegistry()
