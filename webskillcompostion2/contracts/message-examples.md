# Message Examples

Messages are JSON objects. Backend models use Pydantic and frontend models mirror the same camelCase payload shape.

## Connect Server

```json
{
  "type": "connectServer",
  "requestId": "req-1",
  "serverUrl": "opc.tcp://127.0.0.1:4840"
}
```

## Robots Discovered

```json
{
  "type": "robotsDiscovered",
  "requestId": "req-1",
  "serverUrl": "opc.tcp://127.0.0.1:4840",
  "robots": [
    {
      "robotId": "robot-1234",
      "serverUrl": "opc.tcp://127.0.0.1:4840",
      "displayName": "MotionDevice 1",
      "motionDevice": {
        "nodeId": "ns=4;s=MotionDevice_1",
        "displayName": "MotionDevice 1",
        "browseName": "MotionDevice_1"
      },
      "info": {},
      "opcua": {
        "variables": {},
        "methods": {
          "goto": "ns=4;s=MotionDevice_1.JointPTPMoveSkill"
        },
        "axes": {}
      },
      "status": "unknown"
    }
  ]
}
```

## Robot Joint State

```json
{
  "type": "robotJointState",
  "serverUrl": "opc.tcp://127.0.0.1:4840",
  "robotId": "robot-1234",
  "data": {
    "axisValues": {
      "Axis1": 0.2,
      "Axis2": 1.1
    },
    "unit": "rad"
  }
}
```

