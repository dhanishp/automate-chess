# Production Readiness Progress

## Files Changed
- `server/app/game/engine.py`
- `server/app/main.py`
- `server/tests/test_readiness.py`
- `client/src/lib/api.ts`
- `client/src/screens/App.tsx`
- `README.md`
- `DEPLOYMENT.md`
- `PRODUCTION_READINESS_PROGRESS.md`

## What Was Implemented
- Added lightweight Stockfish readiness probing to the existing local Stockfish provider.
- Added `/ready`, returning app readiness plus Stockfish availability, path, and message.
- Kept `/health` unchanged as the lightweight Render health endpoint.
- Added startup Stockfish warmup through the FastAPI lifespan hook; startup logs ready/degraded state without failing the app.
- Added launcher engine readiness polling with subtle top-bar states:
  - `Engine waking up...`
  - `Engine ready`
  - `Engine unavailable`
- Readiness polling retries every 12 seconds while on the launcher until the engine reports ready.
- Documented `/health` vs `/ready`, Render cold starts, and demo warmup recommendations.

## Validation Results
- `cd server && .venv/bin/pytest -q`: passed, 52 tests.
- `cd client && npm run build`: passed.
- `git diff --check`: passed.

## Manual Render QA Checklist
- Deploy to Render and inspect startup logs for the Stockfish readiness line.
- Visit `/health` and confirm `{"status":"ok"}`.
- Visit `/ready` and confirm `status: "ready"` plus `stockfish.available: true`.
- Load the launcher after an idle/cold start and confirm it shows `Engine waking up...` before `Engine ready`.
- Finish one solo or multiplayer setup into autoplay after cold start.
- Temporarily misconfigure `STOCKFISH_PATH` in a test deploy if needed and confirm `/ready` reports `degraded` without crashing the app.
