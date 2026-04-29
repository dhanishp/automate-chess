# Deployment

This app is prepared for a single-instance Render Web Service using Docker.

The production shape is intentionally simple:

- one FastAPI process
- FastAPI serves API routes, WebSockets, and the built React frontend
- room state stays in memory
- Stockfish is installed in the Docker image

Do not run multiple instances unless room state is moved out of memory.

## Render Blueprint

The repo includes `render.yaml`.

Recommended flow:

1. Push the repo to GitHub or GitLab.
2. In Render, create a new Blueprint.
3. Select this repo.
4. Confirm the single `automate-chess` web service.
5. Deploy.

The blueprint uses:

```yaml
runtime: docker
dockerfilePath: ./Dockerfile
dockerContext: .
healthCheckPath: /health
```

## Manual Render Setup

If you do not use the blueprint:

- Service type: Web Service
- Runtime: Docker
- Root directory: repo root
- Dockerfile path: `./Dockerfile`
- Docker context: `.`
- Health check path: `/health`
- Start command: leave blank

The Dockerfile command starts:

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}
```

Render provides `PORT` automatically.

## Environment Variables

Set these in Render if not using `render.yaml`:

```text
SERVE_CLIENT_DIST=1
STOCKFISH_PATH=/usr/games/stockfish
STOCKFISH_MOVETIME_MS=200
STOCKFISH_THREADS=1
STOCKFISH_HASH_MB=64
STOCKFISH_MAX_PLIES=400
```

Optional:

```text
STOCKFISH_SKILL_LEVEL=
```

Do not set `VITE_API_BASE_URL` for the Render single-service deployment. The client should use same-origin REST and WebSocket URLs in production.

## Docker Image

The Dockerfile has two stages:

1. `client-build`
   - installs Node dependencies with `npm ci`
   - builds React/Vite into `client/dist`
2. `runtime`
   - installs Python dependencies
   - installs Debian `stockfish`
   - copies `server/`
   - copies built frontend into `/app/client/dist`
   - runs Uvicorn on `0.0.0.0:$PORT`

Important runtime values:

```text
SERVE_CLIENT_DIST=1
STOCKFISH_PATH=/usr/games/stockfish
```

`SERVE_CLIENT_DIST=1` enables this mount in FastAPI:

```text
/app/client/dist -> /
```

## Same-Origin API And WebSockets

In production, the frontend is served by FastAPI. `client/src/lib/api.ts` handles that by using `window.location.origin` whenever the browser is not on Vite dev port `5173`.

Expected production behavior:

- page: `https://YOUR_SERVICE.onrender.com`
- REST: `https://YOUR_SERVICE.onrender.com/rooms`
- WebSocket: `wss://YOUR_SERVICE.onrender.com/rooms/{room_code}/ws`

Expected Vite dev behavior:

- page: `http://127.0.0.1:5173`
- REST: `http://127.0.0.1:8000`
- WebSocket: `ws://127.0.0.1:8000/rooms/{room_code}/ws`

## Local Docker Smoke Test

Build:

```bash
docker build -t automate-chess-render .
```

Run:

```bash
docker run --rm -p 10000:10000 -e PORT=10000 automate-chess-render
```

Open:

```text
http://127.0.0.1:10000
```

Smoke test:

1. Open `/health`; it should return `{"status":"ok"}`.
2. Start a solo sandbox.
3. Create a multiplayer room in one browser.
4. Join it from another browser.
5. Finish setup into autoplay.
6. Confirm replay generation succeeds.

## Manual QA After Render Deploy

- Visit `/health`.
- Load the root URL and confirm the React app loads.
- Create and join a room across two browser windows.
- Confirm WebSocket updates move setup turns live.
- Finish setup and confirm Stockfish autoplay reaches replay.
- Leave room from each side and confirm the other client returns to menu.
- Refresh during setup and confirm session restore works.
- Test after service idle/cold start if using a free plan.

## Known Deployment Limits

- Single instance only.
- In-memory rooms are lost on deploy, restart, crash, or sleep.
- Horizontal scaling will break rooms unless room state is moved to shared storage.
- No accounts/auth.
- No public matchmaking.
- Multiplayer replay controls are local per client.
- Free hosting may sleep and cold start.
