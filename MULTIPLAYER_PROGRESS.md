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
- `cd server && .venv/bin/pytest -q` -> `30 passed`
- `cd client && npm run build` -> passed

## Remaining Manual QA
- Open two browser windows and verify the full create-room / join-room flow with live board updates in both directions.
- Confirm waiting-room behavior feels clear for the White player before Black joins.
- Confirm both players transition into the same autoplay-ready state after final king placement.
- Sanity-check leave-room behavior:
  - Black leaves and White stays in a waiting state.
  - White leaves and the room closes for both clients.

## Known Multiplayer v1 Limits
- Room state is in memory only, so server restarts clear active rooms.
- Replay controls are local per client in autoplay; the replay data is shared, but playback controls are not host-driven yet.
- Reconnect behavior is minimal: the room snapshot can be restored with the saved token, but there is no advanced recovery workflow yet.

## Recommended Next Milestone
- Multiplayer polish: reconnect/resume behavior, clearer room-close UX, and optional shared replay controls or rematch flow.
