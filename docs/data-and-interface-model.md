# Data and Interface Model

This document describes the shared data and interface model of the application.

## Message Model

Future frontend/backend messages should use JSON and be validated by Pydantic in the backend.

Planned model file:

```text
backend/src/dt_robot_control/models/messages.py
```

Shared message shape:

```json
{
  "type": "subscribe",
  "robotId": "robot-1",
  "url": "opc.tcp://127.0.0.1:4840",
  "payload": {
    "nodeId": "ns=2;s=Robot.Axis1"
  }
}
```

Response shape:

```json
{
  "type": "jointAngles",
  "robotId": "robot-1",
  "url": "opc.tcp://127.0.0.1:4840",
  "data": {
    "jointAngles": [0, 1.57, 0]
  },
  "error": null
}
```

## MCP

TODO

## REST

REST endpoints are used for OPC UA address-space browsing and node details.

TODO
