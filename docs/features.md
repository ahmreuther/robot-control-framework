# Feature Overview

This document gives a high-level overview of the implemented features.

## Purpose

WebSkillComposition is a web-based system for skill-based control of industrial robots. It supports simulation and live control through a Python backend and browser frontend.

## User Workflows

### Connect

The user connects to an OPC UA Robotics Server. Discovered motion devices are turned into robot entries automatically. The backend opens or reuses the OPC UA client, discovers methods and skills for each motion device, subscribes to relevant robot data, and streams updates back to the frontend.

### Simulation

The frontend supports the URDF models **Franka Research 3**, **EVA Automata**, and **UR5e**. A robot can be inspected and manipulated in the 3D scene.

Movements only affect the digital twin. The user can adjust joints with FK sliders or typed values, (drag joints in the 3D view), or move and rotate the TCP with IK controls. This is useful for planning, testing, and checking motion before synchronize to a physical robot or digital twin server.

### Sync Control

With synchronization enabled, changes from the physical robot are shown in the digital twin, and changes made in the digital twin are sent back to the robotics server. The same IK and FK controls are used in online and offline mode, so a movement can be tested first and then executed live.

### Execute Skills

Robot actions are normalized in the backend as either:

- `method` actions
- `skill` actions

This lets the frontend call high-level actions such as:

- `goto`
- `createSession`
- `invalidateSession`
- `initLock`
- `exitLock`

without caring whether the robotics server exposes them as plain OPC UA methods or as state-machine skills.

For skill-based motion such as `goto`, the backend writes the skill `ParameterSet` variables first and then calls `Start`.

### Monitoring

The user can inspect the connected robotics server with the OPC UA address space browser. Nodes can be browsed, variables(e.g., joint positions, temperatures, errors) and events can be subscribed to, and supported methods can be called.

Status updates, warnings, errors, joint values, mode changes, and event messages are shown in the frontend so the user can follow what the backend and robotics server are doing.

### Robot Control UI

The right-hand server panel is organized around connected servers and their discovered motion devices.

- Each connected server shows its discovered motion devices directly inside the server card.
- Selecting a motion device selects the active robot.
- `Take Control` and `Sync` are shown as toggles in the robot body.
- `Details` and `Actions` are shown as disclosures below the toggles.

## Keyboard Shortcuts

While working with the WebSkillComposition 3D viewer, you can quickly switch between view, transformation, and IK control modes using the keyboard.
These shortcuts enable smooth operation without having to constantly click on UI elements.

| Key   | Function                                                                      |
| ----- | ----------------------------------------------------------------------------- |
| **Q** | Switch between **world** and **local coordinate systems** for transformations |
| **W** | Toggle solve with keep TCP orientation                                        |
| **E** | Switch **Rotation** and **Translation**                                       |
| **H** | **Show or hide** the IK interface for manipulating the end effector           |
