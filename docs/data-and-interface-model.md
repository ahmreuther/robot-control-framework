# Data and Interface Model

This document describes the current shared interface model between frontend and backend.

The canonical message definitions live in:

- [frontend `messages.ts`](/frontend/src/shared/api/messages.ts)
- [backend `messages.py`](/backend/src/backend/models/messages.py)

The canonical robot/session data shapes live in:

- [frontend robot types](/frontend/src/entities/robot/model/types.ts)
- [backend robot models](/backend/src/backend/models/robot.py)

## Transport

Frontend and backend communicate over a shared WebSocket using JSON messages.

Each message has:

- a `type`
- a transport-specific payload
- optionally a `requestId`

Commands go from frontend to backend. Events go from backend to frontend.

## Client Commands

Current frontend-to-backend command families:

### Server lifecycle

- `connectServer`
- `disconnectServer`
- `discoverRobots`

Example:

```json
{
  "type": "connectServer",
  "requestId": "connect-1",
  "serverUrl": "opc.tcp://127.0.0.1:4840/freeopcua/server/"
}
```

### Robot subscriptions

- `subscribeRobotJoints`
- `unsubscribeRobotJoints`
- `subscribeRobotMode`
- `unsubscribeRobotMode`

Example:

```json
{
  "type": "subscribeRobotJoints",
  "requestId": "robot-joints-1",
  "robotId": "robot-04fa06763bfb0e7e"
}
```

### Robot control

- `callRobotMethod`
- `executeRobotAction`
- `haltRobotAction`
- `resetRobotAction`

`callRobotMethod` is the legacy plain-method path.

`executeRobotAction` is the normalized action path and should be preferred for app-facing robot behavior such as:

- `goto`
- `home`
- `createSession`
- `invalidateSession`
- `initLock`
- `exitLock`

Example:

```json
{
  "type": "executeRobotAction",
  "requestId": "action-17",
  "robotId": "robot-04fa06763bfb0e7e",
  "actionName": "goto",
  "inputs": {
    "mode": "automatic",
    "joints": [0, 0, 0, 0, 0, 0],
    "max_speed": -1.0,
    "time": -1.0,
    "tcp_config": "",
    "avoidance_zones": ""
  }
}
```

### Address-space browsing and raw OPC UA interaction

- `subscribeNode`
- `unsubscribeNode`
- `subscribeEvent`
- `unsubscribeEvent`
- `callRawMethod`
- `browseAddressSpaceRoot`
- `browseAddressSpaceChildren`
- `browseAddressSpaceReferences`
- `browseAddressSpaceNodeDetails`

## Server Events

Current backend-to-frontend event families:

### Server and robot discovery

- `serverConnected`
- `serverDisconnected`
- `robotsDiscovered`
- `robotInfo`

Example:

```json
{
  "type": "robotsDiscovered",
  "requestId": "discover-1",
  "serverUrl": "opc.tcp://127.0.0.1:4840/freeopcua/server/",
  "robots": []
}
```

### Robot telemetry and action state

- `robotJointState`
- `robotModeChanged`
- `robotActionState`
- `methodResult`

Example:

```json
{
  "type": "robotActionState",
  "serverUrl": "opc.tcp://127.0.0.1:4840/freeopcua/server/",
  "robotId": "robot-04fa06763bfb0e7e",
  "data": {
    "actionName": "goto",
    "kind": "skill",
    "status": "running",
    "currentState": "Running",
    "message": null
  }
}
```

### OPC UA node and event streaming

- `nodeValueChanged`
- `opcuaEvent`

### Address-space data

- `addressSpaceRoot`
- `addressSpaceChildren`
- `addressSpaceReferences`
- `addressSpaceNodeDetails`

### Errors

- `error`

Example:

```json
{
  "type": "error",
  "requestId": "action-17",
  "serverUrl": "opc.tcp://127.0.0.1:4840/freeopcua/server/",
  "robotId": "robot-04fa06763bfb0e7e",
  "message": "Failed to execute robot action 'goto': ...",
  "code": null
}
```

## Robot Session Shape

Discovered robots are transported as `RobotSessionInfo`.

Important fields:

- `robotId`
- `serverUrl`
- `displayName`
- `motionDevice`
- `info`
- `opcua`
- `actions`
- `status`

### Raw OPC UA capability layer

`opcua` contains the raw discovered bindings:

- `variables`
- `methods`
- `skills`
- `axes`

This is the discovery truth from the OPC UA server.

### Normalized action layer

`actions` contains app-facing action bindings such as:

- `goto`
- `home`
- `createSession`
- `invalidateSession`
- `initLock`
- `exitLock`

Each action binding has:

- `kind`: `method` or `skill`
- `targetName`
- optional node ids such as:
  - `methodNodeId`
  - `skillNodeId`
  - `parameterSetNodeId`
  - `resultSetNodeId`
  - `currentStateNodeId`
  - `startNodeId`
  - `haltNodeId`
  - `resetNodeId`
- `parameterNames`
- `resultNames`

This lets the frontend use stable action names without needing to understand the raw server structure.

## Frontend Robot Shape

The frontend extends discovered `RobotSessionInfo` into a richer `Robot` state object.

Additional important fields include:

- `motionDeviceId`
- `joints`
- `actionStates`
- `mode`
- `visual`
- `panel`
- `homeAngles`

### `joints`

`joints` stores the app-level snapshot of last known robot telemetry:

- `axisValues`
- `unit`

High-frequency joint interaction is handled separately by the joint runtime/manager system.

### `actionStates`

`actionStates` stores runtime action lifecycle state per action name, for example:

- `idle`
- `running`
- `succeeded`
- `failed`
- `halted`
- `reset`

### `visual`

`visual` stores robot visualization-related state:

- selected URDF model
- user-facing origin pose
- URDF joint ordering
- axis-to-joint mapping

### `panel`

`panel` stores UI state such as:

- degrees/radians preference
- take-control toggle state
- workspace settings
- goal marker settings

## Notes on Action Semantics

`method` actions and `skill` actions do not execute the same way internally.

### Method action

The backend calls the OPC UA method directly with inputs.

### Skill action

The backend:

1. resolves the skill binding
2. writes input values into the skill `ParameterSet` variable nodes
3. calls the skill `Start`
4. emits `robotActionState` updates as the skill state changes

This is why app code should prefer the normalized action layer over raw method calls whenever possible.

## Source of Truth

If this document and the code ever disagree, the code wins.

Use these files as the final contract reference:

- [frontend `messages.ts`](/frontend/src/shared/api/messages.ts)
- [backend `messages.py`](/backend/src/backend/models/messages.py)
- [frontend robot types](/frontend/src/entities/robot/model/types.ts)
- [backend robot models](/backend/src/backend/models/robot.py)
