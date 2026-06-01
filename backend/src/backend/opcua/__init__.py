"""OPC UA-facing discovery helpers.

Phase 2 keeps these helpers transport-free so tests can use fake discovery data.
Real asyncua browsing can later implement the same shape.
"""

from .discovery import MotionDeviceDescriptor, ServerDiscoveryResult, build_robot_session_infos

__all__ = ["MotionDeviceDescriptor", "ServerDiscoveryResult", "build_robot_session_infos"]
