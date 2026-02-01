Python version for backend

The backend requires Python 3.12.x to ensure compatibility with Open3D.

Options to use Python 3.12 locally:

1. pyenv (recommended)
   - Install pyenv and then:
     ```bash
     pyenv install 3.12.2
     pyenv local 3.12.2
     python -m venv .venv
     source .venv/bin/activate
     pip install -U pip
     pip install -e .
     ```

2. venv + system Python
   - If your system already provides Python 3.12:
     ```bash
     python3.12 -m venv .venv
     source .venv/bin/activate
     pip install -U pip
     pip install -e .
     ```

3. Docker (recommended for reproducible environment)
   - The project's `Dockerfile` uses `python:3.12-slim` for the runtime stage and installs the `uv` CLI, then runs `uv sync` to install dependencies from `pyproject.toml`.
   - Build & run:
     ```bash
     docker build -t webskillcomposition .
     docker run -p 8000:8000 webskillcomposition
     ```

Runtime check

The backend's `main.py` now enforces Python 3.12 at startup and will raise an error if a different Python version is used. This prevents silent incompatibilities with Open3D.

Open3D installation notes

Open3D is used for point cloud processing. On some systems (especially Debian/Ubuntu-based Docker images), Open3D may need extra system libraries or build tools to install correctly. If you install in a virtualenv, pip will usually pull a compatible prebuilt wheel, but on Docker or minimal images you may need to install system packages first:

- Debian/Ubuntu (APT):
  ```bash
  apt-get update && apt-get install -y libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender1 libopenblas-dev
  ```

- Then install in your virtualenv:
  ```bash
  pip install open3d
  ```

- In this project the Dockerfile is already adjusted to install these packages before running `uv sync` so `open3d` will be installed with the other dependencies.