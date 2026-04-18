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
- unit tests for the core rules
- React client scaffold and grayscale-oriented layout shell

Not implemented yet:
- Stockfish autoplay
- bot setup generator
- WebSockets / multiplayer sync
- live board UI interactions

## Run the backend

```bash
cd server
uvicorn app.main:app --reload
```

Backend docs:
- Swagger UI: http://127.0.0.1:8000/docs

## Run tests

```bash
cd server
pytest -q
```

## Frontend scaffold

```bash
cd client
npm install
npm run dev
```

The frontend is only a shell right now. The backend is the real starting point.
