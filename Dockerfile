# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS client-build

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build


FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000 \
    SERVE_CLIENT_DIST=1 \
    STOCKFISH_PATH=/usr/games/stockfish

RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish \
    && test -x /usr/games/stockfish \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/requirements.txt ./server/requirements.txt
RUN pip install --no-cache-dir -r ./server/requirements.txt

COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist

WORKDIR /app/server

EXPOSE 10000

CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
