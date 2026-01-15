FROM node:25-trixie-slim AS build_frontend
WORKDIR /src
COPY ./frontend/. /src/.
RUN npm ci
RUN npm run build



FROM ghcr.io/astral-sh/uv:trixie-slim
WORKDIR /app
COPY ./backend /app/
RUN uv sync
COPY --from=build_frontend /src/public/urdf /app/www/urdf
COPY --from=build_frontend /src/dist /app/www
ENV HOST=true
ENTRYPOINT [ "uv",  "run", "main.py" ]