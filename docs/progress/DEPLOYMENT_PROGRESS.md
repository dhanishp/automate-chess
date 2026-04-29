# Deployment Progress

## Plan

1. Read `CURRENT_STATE_AUDIT.md` and `STABILIZATION_PROGRESS.md`.
2. Add Docker packaging for a single FastAPI service that serves the built React frontend.
3. Install and configure Stockfish in the production image.
4. Add Render configuration and docs for a single-instance Web Service.
5. Verify production same-origin REST/WebSocket behavior.
6. Update README so it reflects the current implemented feature set.
7. Validate backend tests, frontend build, and Docker build if available.

## Files Changed

- `Dockerfile`
- `.dockerignore`
- `render.yaml`
- `run-prod.sh`
- `README.md`
- `DEPLOYMENT.md`
- `DEPLOYMENT_PROGRESS.md`
- `server/app/game/engine.py`

## Deployment Decisions

- Use a Docker-based Render Web Service.
- Keep one process and one instance for v1.
- Build React/Vite inside the Docker image, then copy `client/dist` into the runtime image.
- Run FastAPI/Uvicorn from the `server/` directory.
- Set `SERVE_CLIENT_DIST=1` so FastAPI mounts `client/dist`.
- Bind Uvicorn to `0.0.0.0:${PORT:-10000}`.
- Let Render provide `PORT`; the Docker default is only a local fallback.
- Install Debian `stockfish` in the image and set `STOCKFISH_PATH=/usr/games/stockfish`.
- Do not set `VITE_API_BASE_URL` for Render. The frontend uses same-origin URLs outside Vite dev.
- Include `render.yaml` for Blueprint deployment, while also documenting manual setup.

## Environment Variables

Render / Docker runtime:

```text
SERVE_CLIENT_DIST=1
STOCKFISH_PATH=/usr/games/stockfish
STOCKFISH_MOVETIME_MS=200
STOCKFISH_THREADS=1
STOCKFISH_HASH_MB=64
STOCKFISH_MAX_PLIES=400
```

Render provides:

```text
PORT
```

Optional:

```text
STOCKFISH_SKILL_LEVEL
```

Do not set this for the single-service Render deployment:

```text
VITE_API_BASE_URL
```

## Production URL Behavior

Verified by code inspection in `client/src/lib/api.ts`:

- Vite dev on port `5173` calls `http://<host>:8000`.
- Production with no browser port, such as `https://app.onrender.com`, uses `window.location.origin`.
- Docker/local same-origin with a non-5173 port, such as `http://127.0.0.1:10000`, uses `window.location.origin`.
- WebSocket URLs are derived from the same API base URL and convert `https` to `wss`.

## Validation Results

- `cd server && .venv/bin/pytest -q`
  - Result: passed
  - Output: `37 passed in 1.30s`
- `cd client && npm run build`
  - Result: passed
  - Output summary:
    - `vite v5.4.21 building for production...`
    - `38 modules transformed`
    - `dist/index.html 0.40 kB`
    - `dist/assets/index-D8HURDLK.css 23.85 kB`
    - `dist/assets/index-CmFeYjMj.js 189.35 kB`
    - `built in 815ms`
- `docker build -t automate-chess-render .`
  - Result: not completed locally
  - First attempt was blocked by Docker daemon/socket permissions.
  - Escalated attempt reached Docker but failed with: `Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?`
  - Docker CLI is installed: `Docker version 20.10.22, build 3a2c30b`
- `git diff --check`
  - Result: passed with no whitespace errors

## Remaining Manual Deployment QA

- Deploy the Blueprint or manual Docker Web Service on Render.
- Confirm `/health` returns `{"status":"ok"}`.
- Confirm the root URL serves the React app.
- Confirm the browser does not call `:8000` in production.
- Create and join a room across two public-browser sessions.
- Confirm WebSocket setup sync works through Render.
- Finish setup and confirm Stockfish autoplay succeeds.
- Confirm both clients can leave/return to menu.
- Confirm active rooms disappear on restart/redeploy as expected for in-memory v1.
