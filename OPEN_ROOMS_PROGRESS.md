# Open Rooms Progress

## Plan
- Add private/public room visibility metadata with private as the default.
- Expose a sanitized Open Games endpoint for joinable public waiting rooms.
- Add launcher controls for public/private creation and an Open Games list.
- Preserve room-code joins, invite links, token redaction, and single-instance Render behavior.
- Validate with backend tests, frontend build, and diff whitespace checks.

## Files Changed
- `server/app/game/models.py`
- `server/app/game/rooms.py`
- `server/app/main.py`
- `server/tests/test_rooms.py`
- `client/src/lib/api.ts`
- `client/src/screens/App.tsx`
- `client/src/theme/styles.css`
- `OPEN_ROOMS_PROGRESS.md`

## Implementation Summary
- Added `RoomVisibility` with `private` and `public`; room creation remains private unless explicitly set public.
- Added `OpenRoomSummary` and `GET /rooms/open`, returning only joinable public waiting rooms.
- Open room summaries include room code, status, phase, setup side, and connection booleans, but no player tokens.
- Full rooms, private rooms, and deleted/closed rooms are filtered out of the Open Games list.
- Added a multiplayer launcher visibility toggle with concise private/public explanations.
- Added an Open Games launcher section with manual refresh and polling every 8 seconds while on the launcher.
- Open Games surfaces immediately when public rooms exist; the empty state appears when the multiplayer flow is selected.
- Open Games joins reuse the existing room-code join flow, so invite links and private room behavior remain unchanged.

## Tests / Build Results
- `cd server && .venv/bin/pytest -q`: passed, 45 tests.
- `cd client && npm run build`: passed.
- `git diff --check`: passed.

## Manual QA Checklist
- Create a private room and verify it does not appear in Open Games.
- Create a public room and verify it appears on another browser/device launcher.
- Join the public room from Open Games and verify it disappears from the list after the next refresh.
- Verify joining by room code still works for private and public rooms.
- Verify invite links still auto-join and do not expose opponent tokens.
- Verify Open Games layout on a narrow mobile viewport.

## Deferred Items
- Accounts/auth, persistence, public matchmaking queue, spectators, rematch, and bot difficulty remain intentionally out of scope.
- Open Games is single-instance and in-memory only; rooms still disappear on Render restart or cold-start recycle.
