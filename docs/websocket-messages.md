# WebSocket Messages

This document only describes the WebSocket transport. The shared JSON/Pydantic message shape is documented in [Data and Interface Model](data-and-interface-model.md).

## Purpose

The WebSocket connection is used for live communication between frontend and backend:

- connect or disconnect an OPC UA server
- subscribe or unsubscribe from OPC UA nodes
- stream joint positions, mode changes, and events
- send backend status and error updates to the correct robot in the frontend

Use REST instead for one-time request/response calls such as browsing OPC UA nodes.

## Current State

The current implementation still uses legacy text messages, for example:

```text
command|payload
url|x|typed-message:payload
Global|message
```

The target design is JSON over WebSocket, validated with Pydantic. During migration, old text messages should be accepted only at the WebSocket boundary and converted into the shared model before dispatch.

## Relevant Files

- `backend/src/dt_robot_control/websocket/router.py`
- `backend/src/dt_robot_control/websocket/handlers.py`
- `backend/tests/unit/test_websocket_router.py`
- `backend/tests/unit/test_websocket_handlers.py`
