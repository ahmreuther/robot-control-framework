# WebSkillComposition 2

Migration skeleton for a cleaner server/robot/message architecture.

Phase 1 focuses on contracts only:

- Backend Pydantic models for servers, OPC UA MotionDevices, robots, and messages.
- Frontend TypeScript mirrors for the same concepts.
- Tests for stable robot identity, message validation, and robot-specific routing.

Phase 2 adds the backend runtime skeleton:

- `RuntimeRegistry` indexes server sessions by `serverUrl` and robot sessions by `robotId`.
- `ServerSession` represents one OPC UA server connection.
- `RobotSession` represents one MotionDevice-bound robot behind the serializable `RobotSessionInfo`.
- `handle_client_message` applies validated Pydantic commands to the registry and emits typed server events.
- Fake discovery data can exercise the message path before real asyncua browsing is connected.

Phase 3 adds real OPC UA discovery:

- `discover_server(serverUrl)` connects with asyncua, reads the NamespaceArray, finds Robotics MotionDevices, resolves metadata, axes, `ActualPosition` nodes, and known method bindings.
- `read_robot_joint_state(serverUrl, robot.opcua)` reads the current axis values from the resolved `ActualPosition` nodes.
- The demo integration test is optional and runs when `WSC2_DEMO_OPCUA_URL` is set.

Phase 4 adds the backend JSON WebSocket API:

- FastAPI exposes `/ws`.
- Incoming JSON is validated with Pydantic client-message models.
- `runtime/application_service.py` is the single command-handling path.
- `websocket/router.py` only receives/sends JSON and delegates to the application service.
- `discoverRobots` performs real asyncua discovery and returns `robotsDiscovered`.
- `subscribeRobotJoints` currently returns a one-shot joint-state snapshot, not a continuous subscription yet.
- `callRobotMethod` resolves the method binding and returns a dry-run `methodResult`.

Phase 5 keeps real OPC UA server connections alive:

- `AsyncUaServerConnection` owns one asyncua client per `serverUrl`.
- `ServerSession` stores the live connection beside the serializable server state.
- `discoverRobots` reuses the stored connection instead of reconnecting for every command.
- `subscribeRobotJoints` reads the current joint snapshot through the same stored connection.
- `disconnectServer` closes the asyncua connection and removes the server's robots from the registry.

The central rule is:

```text
Server URL identifies an OPC UA server connection.
robotId identifies one MotionDevice inside that server.
Every robot-specific message must carry robotId.
```

Useful backend checks:

```bash
cd backend
uv run --extra test pytest
WSC2_DEMO_OPCUA_URL=opc.tcp://127.0.0.1:4840/freeopcua/server/ uv run --extra test pytest tests/test_asyncua_discovery.py -q
WSC2_DEMO_OPCUA_URL=opc.tcp://127.0.0.1:4840/freeopcua/server/ uv run --extra test pytest tests/test_websocket_router.py::test_websocket_demo_server_snapshot_when_url_is_configured -q
uv run uvicorn wsc2_backend.app:app --reload
```
