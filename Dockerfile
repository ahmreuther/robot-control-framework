FROM node:25-trixie-slim AS build_frontend
WORKDIR /src
COPY ./frontend/. /src/.
RUN npm ci
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY ./backend /app/

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc libffi-dev build-essential \
        libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 libopenblas-dev \
    && pip install --upgrade pip setuptools wheel \
    && pip install uv \
    && uv sync \
    && apt-get remove -y build-essential gcc \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build_frontend /src/public/urdf /app/www/urdf
COPY --from=build_frontend /src/dist /app/www
ENV HOST=true
ENTRYPOINT [ "uv", "run", "main.py" ]
