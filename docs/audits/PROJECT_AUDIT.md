# Project Audit

Audit date: April 26, 2026

Scope: audit-only inspection of the current repository state. No application code was changed during this pass.

Note: the repo was already in a dirty git state before this audit. The current state includes modified tracked files and an untracked `run-lan.sh`.

## 1. Current feature inventory

### Game modes

- Local same-device setup mode exists through the default `local` game mode.
- Solo sandbox exists as the local mode in the launcher.
- Solo vs bot exists through `GameMode.BOT`, with human side choices for White, Black, or Random.
- Multiplayer room mode exists through private room codes.
- Sample setup exists through the `quickstart` preset endpoint and launcher/sidebar action for non-multiplayer games.

### Setup flow

- Setup is server-authoritative and alternates turns globally.
- White moves first.
- Setup rules include a 35-point budget, piece costs, mandatory 6-pawn minimum, side-specific legal ranks, finish-spending, and king placement.
- Backend rejects out-of-turn actions, illegal squares, occupied squares, insufficient points, early finish, early king placement, and moves that would make mandatory pawn completion impossible.
- King placement can immediately end the game if the king is placed in check.
- The frontend previews piece availability and disables actions for bot turns, inactive multiplayer sides, and waiting rooms.

### Autoplay / replay

- Autoplay is backed by local Stockfish through `python-chess`.
- The backend converts completed custom setups into FEN, runs engine-vs-engine plies, and stores replay moves.
- The frontend has replay playback with pause/resume, restart, step forward/back, speed controls, skip simulation, clickable move list, and delayed result reveal.
- The setup-to-autoplay transition has a calculating overlay and a room-aware pending/running state.
- Replay controls are local per client in multiplayer; the replay data is shared, but playback position is not synchronized.

### Bot

- An easy setup bot exists in `server/app/game/bot.py`.
- The bot enumerates legal actions by simulating them through the same rules engine used for human actions.
- Bot setup turns automatically advance after game creation and after human setup actions.
- Bot behavior is weighted toward required pawns and sane placements.
- No difficulty selection or advanced bot strategy exists yet.

### Multiplayer

- Players can create a room and receive a 6-character room code.
- One player is assigned White on create; the joiner is assigned Black.
- Room access uses per-player tokens stored in `sessionStorage`.
- Backend room state is in memory only.
- Room actions reuse the central setup rules and enforce assigned side plus turn order.
- FastAPI exposes room create, join, fetch, action, leave, and WebSocket endpoints.
- WebSocket snapshots broadcast room membership and game changes.
- The client also does initial room fetch, polling fallback, focus/visibility refresh, heartbeat pings, and light reconnect.
- White leaving closes the room. Black leaving returns White to waiting.
- Opponent-leave UX exists in the client, but still needs browser QA.

### LAN / runtime modes

- `run-dev.sh` starts FastAPI and Vite for local development.
- `run-lan.sh` builds the frontend and serves `client/dist` from FastAPI on `0.0.0.0:8000`.
- `Launch Automate Chess.command` and `make dev` point into the dev launcher path.
- `STOCKFISH_PATH` can point autoplay generation at a local Stockfish binary.
- `PUBLIC_HOST`, `DEV_HOST`, `BACKEND_PORT`, and `FRONTEND_PORT` are partially present in scripts, but port/HMR behavior needs validation.

### UI / polish

- The app has a premium board-first layout with a large board column and operational sidebar.
- Light/dark theme support exists.
- The launcher offers Solo Sandbox, Solo vs Bot, and Multiplayer Room.
- Room code, player side, connection state, waiting state, bot-turn state, and disabled controls are surfaced.
- Unicode chess glyphs have been replaced by inline SVG piece glyphs, which should help Safari/iOS consistency.
- Header/status/replay/result spoiler behavior has received recent polish.

### Testing

- Backend unit tests exist for rules, service/autoplay, bot setup, and room service.
- Current backend validation passed with 33 tests.
- Client TypeScript/build validation passed.
- No frontend unit tests, WebSocket integration tests, browser E2E tests, or visual regression tests were found.

## 2. Architecture summary

### Frontend structure

- Vite + React + TypeScript.
- `client/src/screens/App.tsx` is the main orchestrator for launcher, setup, room sync, bot flow, autoplay transition, and replay routing.
- `client/src/lib/api.ts` defines frontend API types and REST/WebSocket helpers.
- `client/src/lib/board.ts` converts replay FEN into board squares.
- Component split is small and focused: `Board`, `Sidebar`, `AutoplayViewer`, `AppHeader`, `BrandMark`, and `PieceGlyph`.
- `client/src/theme/styles.css` contains most layout and visual styling.

### Backend structure

- FastAPI app lives in `server/app/main.py`.
- Shared Pydantic models live in `server/app/game/models.py`.
- In-memory solo game lifecycle lives in `server/app/game/service.py`.
- In-memory multiplayer room lifecycle lives in `server/app/game/rooms.py`.
- Tests live under `server/tests`.

### Rules engine

- `AutomateRulesEngine` in `server/app/game/rules.py` owns setup action validation and setup phase transitions.
- Solo games, bot games, and multiplayer rooms all route setup actions through this engine.
- Rule coverage is one of the strongest parts of the project.

### Autoplay engine integration

- `LocalStockfishProvider` in `server/app/game/engine.py` resolves Stockfish, builds a `python-chess` board from setup state, runs engine moves up to a configured ply cap, and emits replay data.
- Solo service finalizes autoplay synchronously once setup is ready.
- Multiplayer final king placement first broadcasts pending/running room states, then synchronously generates replay data.

### Bot integration

- `EasySetupBot` enumerates legal candidate setup actions, asks the rules engine whether each is valid, weights candidates, and picks one.
- `GameService` loops bot turns until control returns to the human or autoplay starts.

### Room/multiplayer service

- `RoomService` stores rooms in memory with room code, version, status, shared `GameState`, player tokens, and connected flags.
- `RoomHub` in `server/app/main.py` tracks WebSocket connections per room and broadcasts snapshots or room-closed events.
- Client room sync combines WebSocket events, polling, focus refresh, visibility refresh, and session restore.

### Current runtime/deployment modes

- Dev runtime: FastAPI on port 8000 and Vite on port 5173.
- LAN/runtime mode: production client build served by FastAPI from `client/dist`.
- Persistence is intentionally absent for v1.
- No hosted deployment configuration is present beyond local/LAN scripts.

## 3. What looks solid

- Backend rules are centralized, reused, and covered by tests.
- Setup legality is server-authoritative across local, bot, and multiplayer paths.
- Bot setup does not duplicate legality logic; it simulates candidate actions through the rules engine.
- Solo engine failure rollback is tested and avoids persisting a half-completed autoplay state.
- Room service has a clear v1 data model: room code, player token, assigned side, shared game state, room version, and status.
- Room action tests cover creation, joining, full-room rejection, wrong-side/out-of-turn rejection, autoplay progression, pending/running autoplay state, Black leave, and version increments.
- The frontend has useful action locks around setup submissions and final king/autoplay transition state.
- SVG pieces reduce cross-browser glyph substitution risk.
- Validation is currently green:
  - `cd server && .venv/bin/pytest -q` -> `33 passed in 1.25s`
  - `cd client && npm run build` -> passed, Vite built 38 modules in 818ms

## 4. What looks fragile or unfinished

### Evidence-backed issues

- README is stale relative to current code. It still lists bot setup generation and WebSockets/multiplayer sync as not implemented, while the code and progress notes show both are now present.
- Multiplayer autoplay failure handling is fragile. In `apply_room_action`, the backend broadcasts pending/running states, then calls `finalize_autoplay`. If Stockfish is missing or fails at that point, the endpoint raises an error after the room has already been moved into `AUTOPLAY` with `RUNNING` status. There is no rollback or `FAILED` room snapshot, even though `AutoplayStatus.FAILED` exists.
- Multiplayer autoplay generation is synchronous inside an async FastAPI endpoint. The pending/running broadcasts help UX, but the event loop can still be blocked while Stockfish generates the replay.
- `RoomService.leave_room` normalizes room code for lookup, but White-room deletion uses the original `room_code` parameter. Lowercase or mixed-case leave requests could fail after a successful lookup.
- The current room lifecycle does not reset Black's board state when Black leaves. If a new Black joins later, they appear to inherit the existing Black setup. That may be acceptable for v1, but it needs product decision and manual QA.
- `RoomStatus.COMPLETE` is set for any `AUTOPLAY` phase, including running/pending autoplay generation. That is understandable for "setup complete", but semantically blurry for clients.
- `run-dev.sh` defines `FRONTEND_PORT`, but the Vite command still hardcodes `--port 5173`. `run-lan.sh` supports `BACKEND_PORT`, but the frontend default API URL assumes port 8000 unless an env override is supplied at build time.
- `MULTIPLAYER_PROGRESS.md` says Vite reads `PUBLIC_HOST` for HMR, but current `client/vite.config.ts` does not show HMR config. This may be stale progress text or a runtime regression.
- `client/src/screens/App.tsx` is over 1,400 lines and `client/src/theme/styles.css` is over 1,500 lines. That is workable for a challenge sprint, but future changes to room sync, overlays, and replay routing will be easier to break.
- `Sidebar.tsx` still contains copy saying "Autoplay has not been implemented yet" in a non-setup fallback branch. It may be unreachable in normal flow, but it is stale UI text.

### Needs manual QA

- Full create-room -> join-room -> alternating setup -> final king -> calculating -> replay flow in two browser windows.
- Same flow from a second LAN device using `run-lan.sh`.
- Final king placement transition, especially the non-acting multiplayer client's pending/running overlay.
- Autoplay pending/loading overlay behavior when Stockfish is slow.
- Missing Stockfish behavior in multiplayer.
- White leaves, Black leaves, and Black leaves after placing pieces.
- Session restore and reconnect after refresh, sleep/wake, tab backgrounding, and network interruption.
- Replay consistency between both multiplayer clients. Data should match, but playback controls are intentionally local.
- Mobile Safari/iOS board rendering, piece sizing, touch targets, room-code input, and overlay layout.
- Light-mode board readability on real displays.
- Runtime scripts with non-default `PUBLIC_HOST`, `BACKEND_PORT`, and `FRONTEND_PORT`.

## 5. Recent work summary

### OVERNIGHT_PROGRESS.md

- Recent work focused on final setup click reliability, non-spoiler replay result handling, replay UX, light-mode readability, branding, sample setup, and UI polish.
- Notes repeatedly mark final king placement, sample setup, and light-mode visual polish as needing manual browser QA.
- This moved the app from a raw scaffold toward a demoable interactive product, but much of the confidence is from build/test rather than browser/device validation.

### BOT_PROGRESS.md

- Added bot game metadata, human side choice, easy setup bot, automatic bot turn progression, and backend tests.
- Fixed a real setup-turn stall bug involving completed sides.
- Added back-to-menu behavior and replay speed tuning.
- Remaining bot maturity gap is not legality; it is feel and tuning.

### MULTIPLAYER_PROGRESS.md

- Added in-memory room service, create/join/get/leave/action endpoints, WebSocket snapshots, frontend room create/join, room session restore, side display, waiting state, board locking, LAN readiness, pending/running autoplay sync, SVG pieces, and opponent-leave UX.
- Notes list successful validation at the time as `31 passed` and client build passed. Current validation now reports `33 passed`.
- Remaining manual QA is centered exactly where the current risk is: two-window sync, LAN device flow, final king pending/autoplay handoff, and leave behavior.

## 6. Validation snapshot

### Commands run during this audit

- `cd server && .venv/bin/pytest -q`
  - Result: `33 passed in 1.25s`
- `cd client && npm run build`
  - Result: passed
  - Key output:
    - `vite v5.4.21 building for production...`
    - `38 modules transformed`
    - `dist/index.html 0.40 kB`
    - `dist/assets/index-D8HURDLK.css 23.85 kB`
    - `dist/assets/index-D-dqtiI8.js 189.09 kB`
    - `built in 818ms`

### Test files found

- `server/tests/test_rules.py`
  - Covers setup turn order, legal ranks, mandatory pawns, finish setup, king placement, illegal king-in-check loss, mandatory pawn viability, and ready-for-autoplay transition.
- `server/tests/test_service.py`
  - Covers solo autoplay generation, solo engine-unavailable rollback, sample setup state, and sample bot mode.
- `server/tests/test_bot.py`
  - Covers legal bot action generation, bot setup progression, bot-first starts, full bot progression into autoplay, and completed-side turn repair.
- `server/tests/test_rooms.py`
  - Covers room create/join/full behavior, multiplayer side/turn enforcement, autoplay progression, pending/running autoplay states, Black leave, and version increments.

### Likely coverage gaps

- No frontend component/unit tests.
- No browser E2E tests for setup, replay, bot, or multiplayer.
- No WebSocket endpoint tests through FastAPI's test client.
- No tests for room engine-unavailable failure behavior.
- No tests for White leave with lowercase/mixed-case room codes.
- No tests for reconnection/session restore behavior.
- No tests for LAN runtime scripts.
- No visual/mobile/Safari regression tests.
- No tests for stale or out-of-order WebSocket snapshots beyond client-side version comparison logic.

## 7. Recommended next milestones

### Must do before challenge/demo

1. Update README to reflect current bot, multiplayer, WebSocket, and LAN support.
2. Fix multiplayer autoplay failure handling so missing/failing Stockfish produces a stable room state, ideally `autoplay.status = failed` with a shared error snapshot.
3. Manually QA the full two-window multiplayer flow through setup completion and replay.
4. Manually QA `run-lan.sh` from a second device on the same network.
5. Manually QA missing Stockfish behavior, slow Stockfish behavior, and final king pending/running overlays.
6. Verify leave-room behavior for White, Black before setup, and Black after making setup moves.
7. Smoke-test mobile Safari/iOS layout and touch interaction.

### Nice to have later

1. Add a minimal WebSocket/room API integration test.
2. Add Playwright smoke tests for launcher, local setup, bot setup, multiplayer create/join, and replay.
3. Split `App.tsx` into smaller hooks or route/state modules once behavior stabilizes.
4. Split the large CSS file into mode/layout/component sections or CSS modules.
5. Add room TTL cleanup and clearer abandoned-room lifecycle.
6. Add stronger reconnect/resume UX.
7. Add shared replay controls or explicit "local replay controls" copy for multiplayer.
8. Add bot difficulty tuning and difficulty selection.
9. Clean up runtime env handling for custom ports/HMR.

## 8. Challenge-readiness assessment

The project is closer to feature-complete but needs stabilization than active feature buildout. The major intended surfaces are present: local setup, solo sandbox, solo vs bot, sample setup, autoplay/replay, private room multiplayer, and LAN runtime.

For a strong Handshake Codex Challenge submission/demo, the project needs a short stabilization pass rather than a broad feature push. The highest-impact work is fixing multiplayer autoplay failure state, updating docs, and manually proving the demo path on two browser windows plus one LAN device.

Biggest current risks:

- Multiplayer final setup -> autoplay can look stuck if Stockfish is missing or fails.
- The live multiplayer flow has backend tests, but no browser or WebSocket integration test coverage.
- LAN script and Vite/runtime env behavior may be brittle outside the default `8000/5173` ports.
- Mobile Safari and actual touch-device layout have not been validated in this audit.
- Room lifecycle behavior after opponent leave is minimal and needs product-level acceptance for v1.
