# Multiplayer Progress

## Plan
1. Add an in-memory multiplayer room service with short room codes, side assignment, shared game state, and room lifecycle metadata.
2. Add backend create/join/get/leave/action endpoints plus a WebSocket channel that broadcasts room snapshots whenever room membership or game state changes.
3. Reuse the existing setup rules and autoplay generation flow inside multiplayer room actions so legality and transitions stay server-authoritative.
4. Add backend tests for room creation, joining, side assignment, turn enforcement, synchronized progression into autoplay, and basic room-state integrity.
5. Extend the frontend launcher with minimal multiplayer create/join controls, room-session restore, room code and side display, waiting-for-opponent state, and board locking when it is not the player’s turn.
6. Add WebSocket-driven live synchronization in the frontend and keep the existing autoplay/replay UI for both clients.
7. Validate with backend tests and frontend build, then summarize files changed, what passed, manual QA, and known v1 limitations.

## Progress
- Plan recorded before implementation.
- Added explicit multiplayer room models, requests, responses, and room-status metadata in the shared backend models.
- Implemented an in-memory `RoomService` in `server/app/game/rooms.py` with short room codes, white/black seat assignment, token-based access control, leave behavior, server-authoritative action application, and autoplay transition reuse.
- Added backend room endpoints for create, join, fetch, action submission, leave, and a WebSocket room channel that broadcasts room snapshots and room-close events.
- Reused the existing setup rules and autoplay generation flow for multiplayer instead of duplicating setup logic.
- Added backend tests covering room creation, join/full-room behavior, side assignment, action/turn enforcement, full multiplayer progression into autoplay, and basic leave-state integrity.
- Extended the frontend API layer with room endpoints, room event types, and WebSocket URL generation.
- Added frontend launcher support for private room multiplayer with `Create Room` and `Join Room` actions.
- Added room-session restore, live WebSocket synchronization, room-code display, side display, waiting-for-opponent state, and board locking when it is not the player’s turn.
- Kept autoplay/replay UI intact for multiplayer by reusing the shared game snapshot and letting each client replay the same generated engine game locally in v1.
- LAN-readiness pass: the dev launcher now binds frontend and backend to `0.0.0.0`, the frontend defaults its API/WebSocket host to the current browser hostname, and README now includes a short same-network play section.
- Vite LAN fix: `client/vite.config.ts` now explicitly serves dev on `0.0.0.0:5173`, uses `strictPort: true`, allows LAN hosts during local development, and reads `PUBLIC_HOST` for HMR so other devices on the same network can connect reliably.
- Fixed the final-king multiplayer sync gap: room actions now broadcast a shared autoplay-pending snapshot before engine generation finishes, so the non-acting client no longer stays on stale setup UI while the acting client is already calculating.
- Added a production-style LAN/local runtime path with `run-lan.sh`: it builds `client/dist`, starts FastAPI on `0.0.0.0:8000`, and serves the frontend from the backend for same-origin LAN play without depending on the Vite dev server.
- Mobile/multiplayer polish pass:
  - replaced Unicode piece glyphs with app-controlled inline SVG icons so Safari/iOS cannot substitute platform-specific chess symbols,
  - hardened room sync with an initial room fetch before relying on WebSocket updates, plus a light reconnect/heartbeat loop,
  - made the shared calculating overlay derive from the room's shared autoplay-running state,
  - and cleanly returns the remaining player to the launcher with an `Opponent left the room.` message when the other player exits.

## Files Changed
- `MULTIPLAYER_PROGRESS.md`
- `server/app/game/models.py`
- `server/app/game/rooms.py`
- `server/app/main.py`
- `server/tests/test_rooms.py`
- `client/src/lib/api.ts`
- `client/src/screens/App.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/theme/styles.css`

## Validation
- `cd server && .venv/bin/pytest -q` -> `31 passed`
- `cd client && npm run build` -> passed

## Remaining Manual QA
- Open two browser windows and verify the full create-room / join-room flow with live board updates in both directions.
- Verify the same flow from a second device on the same LAN using the host machine's local IP.
- Confirm waiting-room behavior feels clear for the White player before Black joins.
- Confirm both players transition into the same calculating / autoplay-pending state immediately after final king placement, then into replay once generation completes.
- Sanity-check leave-room behavior:
  - Black leaves and White stays in a waiting state.
  - White leaves and the room closes for both clients.

## Known Multiplayer v1 Limits
- Room state is in memory only, so server restarts clear active rooms.
- Replay controls are local per client in autoplay; the replay data is shared, but playback controls are not host-driven yet.
- Reconnect behavior is minimal: the room snapshot can be restored with the saved token, but there is no advanced recovery workflow yet.

## Recommended Next Milestone
- Multiplayer polish: reconnect/resume behavior, clearer room-close UX, and optional shared replay controls or rematch flow.
