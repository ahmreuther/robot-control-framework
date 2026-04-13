# Feature Overview

This document gives a high-level overview of the implemented features.

## Purpose

WebSkillComposition is a web-based system for skill-based control of industrial robots. It supports simulation and live control through a Python backend and browser frontend.

## User Workflows

### Offline Simulation

The user selects a supported URDF model, such as Franka Research 3, EVA Automata, or UR5e. The frontend loads the model into the 3D scene and the kinematic simulation is ready without a robotics server connection.

In offline mode, movements only affect the digital twin. The user can adjust joints with FK sliders or typed values, (drag joints in the 3D view), or move and rotate the TCP with IK controls. This is useful for planning, testing, and checking motion before connecting to a physical robot or digital twin server.

### Online Control

The user connects the active robot to an OPC UA Robotics Server. The backend opens or reuses the OPC UA client, subscribes to relevant robot data, and streams updates back to the frontend.

With synchronization enabled, changes from the physical robot are shown in the digital twin, and changes made in the digital twin are sent back to the robotics server. The same IK and FK controls are used in online and offline mode, so a movement can be tested first and then executed live.

### Execute Skills

Each movement or action is based on a standardized skill that works identically for all connected robots. `JointPTPMoveSkill` executes point-to-point movement in joint space, while `EndEffSkill` opens or closes grippers and handles other end effector operations.

### Monitoring

The user can inspect the connected robotics server with the OPC UA address space browser. Nodes can be browsed, variables(e.g., joint positions, temperatures, errors) and events can be subscribed to, and supported methods can be called.

Status updates, warnings, errors, joint values, mode changes, and event messages are shown in the frontend so the user can follow what the backend and robotics server are doing.

## Keyboard Shortcuts

While working with the WebSkillComposition 3D viewer, you can quickly switch between view, transformation, and IK control modes using the keyboard.
These shortcuts enable smooth operation without having to constantly click on UI elements.

| Key | Function |
|-------|----------|
| **Q** | Switch between **world** and **local coordinate systems** for transformations |
| **W** | Set transformation mode to **Translation** |
| **E** | Set transformation mode to **Rotation** |
| **T** | **Show or hide** the IK interface for manipulating the end effector |

## Frontend Features

| Feature | Main Files | Notes |
| --- | --- | --- |
| Robot model selection | `frontend/src/index.js`, `frontend/src/robot/robotManager.js` | Add and remove robot models in the scene. |
| Robot URDF visualization | `frontend/src/URDFIKManipulator.js`, `frontend/src/scene/sceneManager.js` | Load supported robot URDF models into the 3D viewer. |
| Robot IK controls | `frontend/src/URDFIKManipulator.js` | Move or rotate the TCP in the workspace with inverse kinematics. |
| Robot FK controls | `frontend/src/index.js`, `frontend/src/URDFIKManipulator.js` | Change joint values with sliders, typed input or direct manipulation. |
| Connect to robotics server | `frontend/src/index.html`, `frontend/src/opcua/connection.js` | URL input and connect/disconnect buttons. |
| Synchronize toggle | `frontend/src/index.html`, `frontend/src/opcua/connection.js`, `frontend/src/ui/robotUiState.js` | Synchronize joint values with the robotics server and send changed joints from the URDF model. |
| Physical Twin Dashboard | `frontend/src/index.html`, `frontend/src/ui/layout.js`, `frontend/src/ui/robotUiState.js` | Display details of the active robot when connected to a robotics server. |
| OPC UA address space browser | `frontend/src/opcua/addressSpace.js`, `frontend/src/opcua/contextMenu.js`, `frontend/src/index.html` | Browse nodes, subscribe to variables and events and call methods. |
| General controls | `frontend/src/index.js`, `frontend/src/index.html` | Switch radians/degrees, collision meshes, work envelopes, auto center, ignore joint limits and joint limits. |
| Live status | `frontend/src/ui/robotUiState.js`, `frontend/src/opcua/connection.js`, `frontend/src/index.html` | Display robotics server state. |
| Message log | `frontend/src/ui/logging.js`, `frontend/src/index.html` | Track status messages, warnings and errors. |
| Multi-robot state handling | `frontend/src/robot/robotManager.js` | Manage active robot, shared socket, per-robot state and controls. |

## Backend Features

| Feature | Main Files | Notes |
| --- | --- | --- |
| OPC UA connection | `backend/src/dt_robot_control/opcua/opcua_client.py`, `backend/src/dt_robot_control/services/client_registry.py` | Connect and disconnect the digital twin from an OPC UA Robotics Server. |
| WebSocket communication | `backend/src/dt_robot_control/websocket/router.py`, `backend/src/dt_robot_control/websocket/handlers.py` | Shared live channel for robot status, subscriptions and streaming updates. |
| MCP integration | `backend/src/dt_robot_control/server/mcp.py` | Expose selected robot actions through MCP. |
| OPC UA address space browser | `backend/src/dt_robot_control/opcua/endpoints.py` | Browse nodes, subscribe to variables and events and call methods. |
| Skill execution | `backend/src/dt_robot_control/opcua/opcua_client.py`, `frontend/src/ui/robotUiState.js`, `frontend/src/opcua/contextMenu.js` | Execute robot skills. |
