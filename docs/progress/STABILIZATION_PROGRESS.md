# Stabilization Progress

## Plan

1. Read `CURRENT_STATE_AUDIT.md` and target only the challenge-readiness blockers called out there.
2. Make multiplayer autoplay failures become shared room state instead of leaving clients stuck in calculating/running.
3. Stop exposing opponent room tokens in room snapshots while preserving each client's own top-level token for restore/actions.
4. Enforce server-side room readiness so setup actions cannot happen before both players join.
5. Make leave-room behavior consistent for v1: either player leaving closes the room.
6. Remove stale UI copy around implemented autoplay.
7. Validate with backend tests and client production build.

## Files Changed

- `STABILIZATION_PROGRESS.md`
- `server/app/game/models.py`
- `server/app/game/rooms.py`
- `server/app/main.py`
- `server/tests/test_rooms.py`
- `client/src/lib/api.ts`
- `client/src/screens/App.tsx`
- `client/src/components/Sidebar.tsx`

## Fixes Made

- Added public room snapshot models that omit player tokens:
  - internal `RoomState` still stores tokens for backend access control
  - client-facing room responses/events now expose only side/connected status for each player
  - each client still receives its own token only as the top-level `player_token`
- Added backend tests proving room snapshots do not expose player tokens.
- Added a server-side pre-join setup guard:
  - room actions are rejected until both players are present
  - FastAPI maps this to a clear `409` response
- Changed v1 leave-room semantics:
  - either White or Black leaving closes the room
  - room-code normalization is used before delete, so lower/mixed-case leave paths do not break
  - frontend WebSocket room-closed handling continues to return clients to the launcher with a clear message
- Fixed multiplayer autoplay failure handling:
  - engine failures now persist `autoplay.status = failed`
  - the failure error is stored in shared game state
  - the failed snapshot is broadcast and returned, avoiding indefinite calculating overlays
  - the failed replay screen includes a direct `Back to menu` recovery action
- Removed stale "Autoplay has not been implemented yet" copy.
- Small deployment-stability cleanup:
  - production/same-origin frontend runtime now uses `window.location.origin`
  - Vite dev on port `5173` still defaults API/WebSocket calls to backend port `8000`

## Tests / Build Results

- `cd server && .venv/bin/pytest -q`
  - Result: passed
  - Output: `37 passed in 1.23s`
- `cd client && npm run build`
  - Result: passed
  - Output summary:
    - `vite v5.4.21 building for production...`
    - `38 modules transformed`
    - `dist/index.html 0.40 kB`
    - `dist/assets/index-D8HURDLK.css 23.85 kB`
    - `dist/assets/index-CmFeYjMj.js 189.35 kB`
    - `built in 820ms`

## Remaining Manual QA

- Two-browser multiplayer happy path:
  - create room
  - join room
  - alternate setup
  - final king
  - calculating
  - replay ready
- Multiplayer missing/failing Stockfish path in a browser:
  - confirm both clients leave calculating state
  - confirm both clients see the shared failure message
  - confirm both can return to menu
- Leave-room browser QA:
  - White leaves
  - Black leaves
  - leaving during setup
  - leaving during autoplay/replay
- LAN QA from a second device using `run-lan.sh`.
- Mobile Safari/Chrome smoke test for room code input, board taps, overlays, and replay controls.
- Public deployment still needs separate deployment packaging work for Stockfish install/start command.

## Deployment Sprint Readiness

Ready for the next deployment sprint, with caveats.

The app is safer to expose publicly than before this pass: multiplayer token exposure, pre-join actions, leave-room staleness, and stuck Stockfish failures are addressed. The next sprint should focus on deployment packaging rather than product features: Docker/Render config, `$PORT` start command, Stockfish installation, and final hosted WebSocket smoke testing.
