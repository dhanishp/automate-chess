# Final Submission QA Polish

## Files changed

- `server/app/game/models.py`
- `server/app/game/rules.py`
- `server/app/game/service.py`
- `server/app/game/rooms.py`
- `server/app/main.py`
- `server/tests/test_rules.py`
- `server/tests/test_service.py`
- `server/tests/test_rooms.py`
- `client/src/lib/api.ts`
- `client/src/screens/App.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/components/AutoplayViewer.tsx`
- `client/src/theme/styles.css`
- `README.md`
- `HANDSHAKE_SUMMARY.md`
- `DEMO_PLAN.md`
- `SUBMISSION_BLURB.md`

## King-loop investigation and fixes

- Hardened the solo/local/bot action path so final king placement is followed by a defensive refetch.
- If an action errors, the frontend now refetches the latest backend game/room state before showing a stale setup error.
- If a restored solo game no longer exists after restart/idle cleanup, session storage is cleared and the launcher explains that the saved game expired.
- If a restored room no longer exists, room storage is cleared and the launcher explains that the room closed or expired.
- Backend tests now cover bot-completed-side turn normalization, final king persistence, and engine failure after final king placement.
- Added a `/warmup` preflight path and launcher gate so cold visitors cannot start or join until Stockfish completes a tiny real search.

Root cause found: no single deterministic backend rollback was found. The backend already persisted successful final king placement in the normal path. The fragile part was frontend recovery around stale restored state and action errors: a failed/slow request could leave the client rendering its previous setup snapshot. The fix makes backend state authoritative after final-king actions and after action errors.

Additional first-tab finding: the cold first tab could surface `Body is disturbed or locked`. The frontend API wrapper was reading an error response as JSON and then trying to read it again as text if JSON parsing failed. `client/src/lib/api.ts` now centralizes response parsing and consumes each fetch body exactly once. Callers receive structured `ApiError` values and never re-read `Response` bodies.

## Setup completion polish

- Added backend auto-locking when a side has placed the minimum pawns, has no legal affordable non-king buys left, and has not placed its king.
- This does not auto-place the king and still enforces the mandatory pawn minimum.
- Validation copy now says "Minimum pawns placed" and "Place at least 6 pawns..." so the pawn rule does not read like a maximum.
- The setup validation panel is shorter: minimum pawns, budget/setup state, king state, and one instruction message.

## Copy changes

- User-facing replay/autoplay language was updated to battle/simulation language.
- Move list copy is now labeled as battle notation rather than replay notation.
- README and submission docs were lightly updated to match the current product language.

## Activity and stats cleanup

- Added in-memory `created_at` / `updated_at` timestamps for games and rooms, plus room `last_activity_at`.
- `/stats` now includes `total_battles_played`, counted when a Stockfish battle simulation completes successfully.
- Active solo/local/bot games expire after 15 minutes of inactivity.
- Terminal solo/local/bot games are excluded from live stats and can be cleaned after 60 minutes.
- Waiting rooms with no connected players expire after 10 minutes.
- Connected waiting rooms expire after 30 minutes of room inactivity.
- Terminal multiplayer rooms are excluded from live stats and can be cleaned after 60 minutes.
- Open Games uses the same cleanup path, so stale public waiting rooms disappear.

## UI polish

- Launcher shows `Total battles played: N`.
- Launcher blocks start/create/join actions until the battle engine warmup succeeds, with retry copy for degraded states.
- Final-result and confirmation modals now sit above battle/status panels and are constrained for mobile Safari.
- Light mode received small contrast improvements for panels, messages, status chips, and validation areas.

## Validation results

- `cd server && .venv/bin/pytest -q`: `64 passed`
- `cd client && npm run build`: passed
- `git diff --check`: passed

## Manual QA checklist

- Fresh Render load after deploy.
- First tab after Render cold start: wait for engine ready, then start a game without any `Body is disturbed or locked` message.
- Singleplayer vs Bot as White, final king after bot done.
- Singleplayer vs Bot as Black, final king after bot done.
- Multiplayer final king transition for both clients.
- No-legal-buys auto-lock case.
- Mobile final-result modal on iPhone Safari.
- Light mode menu and validation readability.
- Live stats count drops after Back to menu.
- Public room disappears after join, close, or expiry.
- Total battles played increments after battle simulation completes.
