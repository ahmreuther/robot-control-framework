# Development Setup

This document describes how to set up and run WebSkillComposition locally.

## Requirements

- Git
- Git LFS
- Python 3.12.x
- Node.js LTS (e.g., 20.x) and npm
- uv
- Access to an OPC UA Robotics Server

## Repository Setup

- macOS/Linux:
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
  Inside the project execute:
  ```
  git lfs install && git lfs pull
  ```
- Windows (PowerShell):
  `powershell
    iwr https://astral.sh/uv/install.ps1 -UseBasicParsing | iex
    `
  > **Note:** The backend requires **Python 3.12.x** for Open3D compatibility. If your system Python is different, consider using `pyenv` to install Python 3.12 or run the app in Docker (the project's `Dockerfile` is configured to use Python 3.12).

> If you don't want to use **uv**, you can also work with `venv` + `pip`.

## Cloning the repository

It is important to clone the submodules along with the repository. The following command can be used:

```bash
git clone git@git.rwth-aachen.de:ai-in-production/project-repositories/webskillcomposition.git --recurse-submodules
```

## Backend Setup

```bash
cd backend
uv pip install -e .
uv run main.py
```

TODO: Confirm whether `uv sync` should be preferred over `uv pip install -e .`.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

TODO: Add frontend dev server URL.

## Running Tests

Backend:

```bash
cd backend
uv run pytest
```

Frontend:

```bash
cd frontend
```

## Local Services

| Service       | Default URL              | Notes                                           |
| ------------- | ------------------------ | ----------------------------------------------- |
| Backend       | `http://127.0.0.1:8000`  | FastAPI app started with `uv run main.py`.      |
| WebSocket     | `ws://127.0.0.1:8000/ws` | Shared socket for robot communication.          |
| Frontend      | `http://localhost:1234`  | Parcel dev server started with `npm run start`. |
| MCP           | TODO                     |                                                 |
| OPC UA Server | `opc.tcp://...`          | Depends on robot, simulator, or digital twin.   |
