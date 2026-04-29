# Automate Chess

Browser-based Automate-style chess for the Handshake Codex Challenge.

Players build custom chess formations with a points budget, place kings last, and then watch Stockfish autoplay the resulting position into a replay.

## Current Features

- Local same-device setup / solo sandbox
- Singleplayer vs setup bot with White, Black, or Random human side choice
- Public/private room-code multiplayer over WebSockets, with invite links and Open Games
- Server-authoritative setup legality and multiplayer turn order
- Visible alternating setup phase with legal placement highlights
- Stockfish-backed autoplay/replay
- Replay controls with pause, step, speed, restart, skip, move list, and copyable replay notation
- SVG pieces for consistent browser rendering
- Sample setup preset
- Light/dark theme
- Launcher live stats and engine readiness indicator backed by `/ready`
- LAN runtime mode
- Docker/Render single-instance deployment path

## Local Development

Use this for normal development with FastAPI and Vite HMR:

```bash
bash ./run-dev.sh
```

Or:

```bash
make dev
```

On macOS, you can also double-click `Launch Automate Chess.command`.

Dev mode starts:

- FastAPI: `http://127.0.0.1:8000`
- Vite: `http://127.0.0.1:5173`

The Vite client intentionally calls the backend on port `8000` during local dev.

## LAN Mode

Use LAN mode for same-network phone/laptop testing. It builds the frontend and serves `client/dist` from FastAPI on one origin:

```bash
export PUBLIC_HOST=192.168.1.42
bash ./run-lan.sh
```

Then open:

```text
http://YOUR_LAN_IP:8000
```

Useful local IP commands:

- macOS: `ipconfig getifaddr en0`
- Linux: `hostname -I`

## Stockfish

Autoplay requires Stockfish.

For local dev, install Stockfish and set `STOCKFISH_PATH` if it is not in a common path:

```bash
export STOCKFISH_PATH=/absolute/path/to/stockfish
bash ./run-dev.sh
```

Common paths checked by the backend include:

- `/opt/homebrew/bin/stockfish`
- `/usr/local/bin/stockfish`
- `/usr/bin/stockfish`
- `/usr/games/stockfish`

The Docker image installs Stockfish with apt and sets:

```text
STOCKFISH_PATH=/usr/games/stockfish
```

If Stockfish is missing or fails, solo/local/bot games store a clean failed autoplay state instead of a half-complete replay. Multiplayer stores and broadcasts a shared `failed` autoplay state so both clients can return to menu.

The backend exposes two deployment checks:

- `/health`: lightweight process health for Render.
- `/ready`: app readiness plus a lightweight Stockfish launch/ping check. It returns `ready` when Stockfish is available and `degraded` when the app is up but the engine is unavailable.

The backend also performs the same lightweight Stockfish check on startup. On free Render instances, wake the app and check `/ready` before a demo so the first real autoplay is not the first time the engine is touched.

## Render Deployment

This repo supports a single-instance Render Web Service using Docker.

FastAPI serves both:

- REST/WebSocket API routes
- built React frontend from `client/dist`

Production is same-origin:

- REST calls go to `https://YOUR_SERVICE.onrender.com`
- WebSockets use `wss://YOUR_SERVICE.onrender.com`
- no production API calls should target `:8000`

Quick path:

1. Push this repo to GitHub/GitLab.
2. In Render, create a new Blueprint from `render.yaml`, or create a Web Service manually.
3. Use Docker runtime.
4. Use the root `Dockerfile`.
5. Health check path: `/health`.
6. Deploy, then open `/ready` once before demos to confirm Stockfish readiness.

Manual Render settings:

- Service type: Web Service
- Runtime / Language: Docker
- Dockerfile path: `./Dockerfile`
- Docker context: `.`
- Health check path: `/health`
- Start command: leave blank; Docker `CMD` is used

Environment variables:

```text
SERVE_CLIENT_DIST=1
STOCKFISH_PATH=/usr/games/stockfish
STOCKFISH_MOVETIME_MS=200
STOCKFISH_THREADS=1
STOCKFISH_HASH_MB=64
STOCKFISH_MAX_PLIES=400
```

Render provides `PORT`; the Docker command binds Uvicorn to `0.0.0.0:${PORT:-10000}`.

Render free services can sleep after idle time and cold start on the next visit. The launcher shows a small engine readiness indicator; a paid always-on instance avoids free-tier sleep/cold starts.

More detailed steps are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Production Docker

Build locally:

```bash
docker build -t automate-chess-render .
```

Run locally:

```bash
docker run --rm -p 10000:10000 -e PORT=10000 automate-chess-render
```

Open:

```text
http://127.0.0.1:10000
```

For a non-Docker production-style local run after building the frontend:

```bash
cd client && npm run build
cd ..
PORT=8000 bash ./run-prod.sh
```

## Tests

Backend:

```bash
cd server
.venv/bin/pytest -q
```

Frontend build:

```bash
cd client
npm run build
```

## Known Limitations

- Multiplayer rooms are in memory only.
- Deployment is single-instance only; do not scale horizontally without shared room state.
- Rooms disappear on server restart or redeploy.
- No accounts/auth.
- Open Games is a lightweight list of public waiting rooms, not a persistent matchmaking queue.
- Replay data is shared in multiplayer, but replay controls are local per client.
- Free hosting may sleep and cold start.
- If a Render deploy restarts the service, active rooms are lost.
