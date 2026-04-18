# Automate Chess agent instructions

## Project context
This repo is a browser-based Automate-style chess variant.

Current state:
- local 2-player setup mode works
- solo sandbox works
- solo-vs-bot setup mode works
- autoplay/replay flow works
- sample setup exists
- current UI/layout direction is established

## Current objective
Implement room-code multiplayer v1.

Players should be able to:
- create a private room
- join via room code
- see synchronized setup turns
- place pieces in alternating visible setup
- transition together into the existing autoplay/replay flow

## Non-negotiables
- Backend is the source of truth for legality and turn order.
- Do not change core game rules unless fixing a real bug.
- Do not redesign the app.
- Do not implement accounts/auth in this sprint.
- Do not implement public matchmaking in this sprint.
- Do not add database/persistence unless absolutely necessary.
- Do not overbuild chat, social features, or profile systems.
- Preserve the current premium board-first UI direction.

## Scope for this sprint
Build only:
1. private room creation
2. join by room code
3. multiplayer setup synchronization
4. synchronized autoplay/replay state
5. back-to-menu / leave-room flow
6. progress logging in `MULTIPLAYER_PROGRESS.md`

## Multiplayer design rules
- Use a server-authoritative room/game state.
- Each room should have exactly one shared game state.
- One player controls White, the other controls Black.
- Setup remains visible and alternating.
- Only the active side can act.
- Illegal actions must still be rejected by backend rules.
- Both clients should see the same board and state.
- Existing autoplay logic should run after setup completes.
- Existing replay UI should remain usable for both players.

## Technical direction
Prefer:
- FastAPI backend
- WebSocket sync for live multiplayer events
- Keep room state in memory for v1 unless persistence is unavoidable

Avoid:
- database work
- complex reconnect architectures beyond minimal resilience
- major frontend rewrites
- speculative abstractions that delay shipping

## UI expectations
Add only the minimum UI needed:
- create room
- join room by code
- show room code
- show player side / connected state
- disable actions when it is not the player’s turn
- show waiting states cleanly
- preserve current board/sidebar layout direction

## Skip simulation behavior
Do not implement full skip-agreement workflow yet unless it is trivial.
If skip exists already for solo/autoplay, leave multiplayer-compatible hooks cleanly but do not overbuild consensus logic in this sprint unless explicitly needed.

## Code quality
- Prefer small, focused changes.
- Reuse existing service/rules pathways.
- Keep multiplayer logic in dedicated backend modules/services where possible.
- Add/update tests for room creation, joining, synchronized actions, and autoplay progression.
- Avoid dead code and UI hacks.

## Required outputs
Create/update:
- `MULTIPLAYER_PROGRESS.md`

It should include:
- initial plan
- milestones completed
- files changed
- what passed
- what still needs manual QA
- recommended next milestone

## Stop conditions
Stop and report instead of continuing if:
- backend tests fail and cannot be fixed confidently
- frontend build fails and cannot be fixed confidently
- room synchronization is unreliable
- autoplay breaks in multiplayer
- a change would require accounts/auth or major persistence work
- UI would need a broad redesign to continue

## Validation required before stopping
Run:
- `cd server && .venv/bin/pytest -q`
- `cd client && npm run build`

Before finishing, summarize:
- files changed
- what was implemented
- what still needs manual QA
- known limitations in multiplayer v1

## After this sprint
The likely next milestone is:
- multiplayer polish (reconnect, leave/rematch, optional skip agreement)
or
- bot difficulty tuning

Do not start either unless explicitly asked.