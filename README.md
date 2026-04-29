# Automate Chess

Initial scaffold for an Automate-style chess builder:

- Exact-ish Automate ruleset as the default preset
- FastAPI backend with in-memory game state
- Turn-based visible setup flow
- Validation for costs, placement zones, finish-setup, and king placement
- Replay-ready state representation
- Frontend shell for the eventual React client

## Current status

Implemented now:
- backend rules engine
- in-memory game service
- REST endpoints for create game / inspect game / submit actions
- unit tests for the core rules and service
- React client setup flow with backend-driven placement validation
- Stockfish-backed autoplay generation from the finished custom setup
- frontend autoplay/replay viewer with playback controls

Not implemented yet:
- bot setup generator
- WebSockets / multiplayer sync
- hosted persistence / deployment hardening

## Run locally

### Dev mode

Use this for normal local development with Vite and HMR:

```bash
bash ./run-dev.sh
make dev
```

On macOS, you can also double-click `Launch Automate Chess.command`.

This starts:
- FastAPI on `http://127.0.0.1:8000`
- Vite on `http://127.0.0.1:5173`

### LAN mode

Use this for reliable same-network play from phones or other devices. It builds the frontend and serves it from FastAPI on the same origin:

```bash
export PUBLIC_HOST=192.168.1.42
bash ./run-lan.sh
```

This starts FastAPI on `0.0.0.0:8000`, serves the built frontend from `client/dist`, and makes the app available at:

```text
http://YOUR_LAN_IP:8000
```

Helpful commands for finding your local IP:
- macOS: `ipconfig getifaddr en0`
- Linux: `hostname -I`

From another device on the same network, open:

```text
http://YOUR_LAN_IP:8000
```

For autoplay generation, install Stockfish locally and set `STOCKFISH_PATH` if it is not available in a common path such as `/opt/homebrew/bin/stockfish` on macOS:

```bash
export STOCKFISH_PATH=/absolute/path/to/stockfish
bash ./run-dev.sh
```

Backend docs:
- Swagger UI: http://127.0.0.1:8000/docs

## Run tests

```bash
cd server
pytest -q
```
