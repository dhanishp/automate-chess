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

Keep Render's health check on `/health`. Use `/ready` for manual app and Stockfish readiness checks.

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

## Health And Readiness

- `/health` is intentionally tiny and returns `{"status":"ok"}` when the FastAPI process is alive.
- `/ready` verifies app readiness and performs a lightweight Stockfish binary launch/ping. It does not run a full engine game.
- If Stockfish is unavailable, `/ready` returns `status: "degraded"` with a clear Stockfish message while keeping the app online.
- The backend runs the same lightweight Stockfish check on startup and logs whether the engine was found/warmed.

Before demos or judge sessions on Render free hosting, open the root URL or `/ready` once and wait for the launcher to show `Engine ready`. A paid always-on Render instance avoids free-tier sleep and most cold-start delays.

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
2. Open `/ready`; it should report `status: "ready"` and `stockfish.available: true`.
3. Start a solo sandbox.
4. Create a multiplayer room in one browser.
5. Join it from another browser.
6. Finish setup into autoplay.
7. Confirm replay generation succeeds.

## Manual QA After Render Deploy

- Visit `/health`.
- Visit `/ready` and confirm Stockfish is ready before demos.
- Load the root URL and confirm the React app loads.
- Confirm the launcher shows `Engine ready`.
- Create and join a room across two browser windows.
- Confirm WebSocket updates move setup turns live.
- Finish setup and confirm Stockfish autoplay reaches replay.
- Leave room from each side and confirm the other client returns to menu.
- Refresh during setup and confirm session restore works.
- Test after service idle/cold start if using a free plan; wake the app with `/ready` first for demos.

## Known Deployment Limits

- Single instance only.
- In-memory rooms are lost on deploy, restart, crash, or sleep.
- Horizontal scaling will break rooms unless room state is moved to shared storage.
- No accounts/auth.
- No public matchmaking.
- Multiplayer replay controls are local per client.
- Free hosting may sleep and cold start; warm `/ready` before friend/judge tests, or use a paid always-on instance.
