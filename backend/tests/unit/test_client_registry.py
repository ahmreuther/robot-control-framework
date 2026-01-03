"""Tests for ClientRegistry service."""

import pytest
from unittest.mock import MagicMock
from dt_robot_control.services.client_registry import ClientRegistry


@pytest.fixture
def registry():
    "We are creating a fresh ClientRegistry for each test."
    return ClientRegistry()


@pytest.fixture
def mock_client():
    """Create a fake OPCUAClient."""
    client = MagicMock()
    client.name = "MockClient"
    return client

url = "opc.tcp://localhost:4840"

def test_add_client(registry, mock_client):
    """Test adding a client to the registry."""

    registry.add(url, mock_client)
    
    # check if added 
    assert registry.has(url)
    assert registry.get(url) == mock_client


def test_get_existing_client(registry, mock_client):
    """Test getting client."""
    registry.add(url, mock_client)
    result = registry.get(url)
    
    assert result == mock_client


def test_get_nonexistent_client(registry):
    """Test client that doesn't exist returns: None."""
    result = registry.get("opc.tcp://nonexistent:4840")
    
    assert result is None


def test_remove_existing_client(registry, mock_client):
    """remov existing client."""
    registry.add(url, mock_client)
    
    removed = registry.remove(url)
    
    assert removed is True
    assert not registry.has("opc.tcp://localhost:4840")


def test_remove_nonexistent_client(registry):
    """removing nonexisting client, returns: False."""
    removed = registry.remove("opc.tcp://nonexistent:4840")
    
    assert removed is False


def test_has_existing_client(registry, mock_client):
    """check if client exists, returns: True."""
    registry.add(url, mock_client)
    
    assert registry.has(url) is True


def test_has_nonexistent_client(registry):
    """check if client exists, returns: False."""
    assert registry.has("opc.tcp://nonexistent:4840") is False


def test_all_returns_all_clients(registry):
    """Test getting all clients."""
    client1 = MagicMock()
    client2 = MagicMock()
    registry.add("opc.tcp://server1:4840", client1)
    registry.add("opc.tcp://server2:4840", client2)
    
    all_clients = registry.all()
    
    assert len(all_clients) == 2
    assert all_clients["opc.tcp://server1:4840"] == client1
    assert all_clients["opc.tcp://server2:4840"] == client2


def test_all_returns_copy(registry, mock_client):
    """Test that all() returns a copy, not a reference."""
    registry.add(url, mock_client)
    
    all_clients = registry.all()
    all_clients["opc.tcp://new:4840"] = MagicMock()
    
    # modification shouldn't affect registry
    assert not registry.has("opc.tcp://new:4840")
    assert len(registry.all()) == 1


def test_clear_removes_all_clients(registry):
    """clear all clients from registry."""
    client1 = MagicMock()
    client2 = MagicMock()
    registry.add("opc.tcp://server1:4840", client1)
    registry.add("opc.tcp://server2:4840", client2)
    
    registry.clear()
    
    assert len(registry.all()) == 0
    assert not registry.has("opc.tcp://server1:4840")
    assert not registry.has("opc.tcp://server2:4840")


def test_add_replaces_existing_client(registry):
    """adding a client with an existing URL replaces the old client."""
    old_client = MagicMock()
    new_client = MagicMock()
    registry.add(url, old_client)
    
    registry.add(url, new_client)
    
    assert registry.get(url) == new_client
    assert len(registry.all()) == 1
