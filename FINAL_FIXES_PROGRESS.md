# Final Fixes Progress

## Files changed
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

## Fixes made
- Persisted solo/singleplayer final king placement even when autoplay generation fails, storing a clean failed autoplay state instead of rolling back to setup.
- Added service tests covering final White and Black king placement into autoplay.
- Added backend rules helper for detecting legal affordable non-king placements.
- Covered the no-legal-affordable-placement edge case while preserving mandatory pawn enforcement.
- Added a `/stats` endpoint with active room, connected player, and occupied player counts.
- Added a subtle launcher status pill that polls `/stats` while on the homepage.
- Added clearer frontend hinting when no legal buys remain and Finish Setup is the path to king placement.

## Validation results
- `cd server && .venv/bin/pytest -q`
  - Passed: `42 passed in 1.13s`
- `cd client && npm run build`
  - Passed: `39 modules transformed`, built in `769ms`
- `git diff --check`
  - Passed with no whitespace errors.

## Manual QA
- Singleplayer vs Bot as White: finish setup, place king once, confirm calculating remains until replay or failed state.
- Singleplayer vs Bot as Black: same flow.
- Local sandbox: finish both sides, place both kings, confirm replay starts once.
- Setup edge case: create a board with no affordable legal buys remaining and confirm Finish Setup is available and clear.
- Deployed homepage: verify active game/player pill appears and updates without visual noise.
