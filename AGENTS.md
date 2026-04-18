# Automate Chess agent instructions

## Project context
This repo is a browser-based Automate-style chess variant.

Current state:
- local 2-player setup mode works
- setup rules and autoplay/replay flow work
- UI is in a good state
- next milestone is solo bot setup mode

## Current objective
Implement solo-vs-bot mode for setup only.

The human should be able to choose White, Black, or Random.
The bot should take setup turns for the opposing side.
After setup is complete, the existing autoplay/replay flow should run unchanged.

## Non-negotiables
- Backend is the source of truth for legality.
- Do not change core game rules unless fixing a real bug.
- Do not redesign the app.
- Do not implement multiplayer in this sprint.
- Do not implement accounts, persistence, deployment work, or public lobbies.
- Do not introduce major dependencies unless clearly justified.
- Keep the current premium board-first UI direction intact.

## Bot rules
The bot is only responsible for setup actions.

It must always respect:
- budget
- mandatory pawn requirements
- legal square restrictions
- king-last rule
- impossible-state prevention already enforced by backend
- existing setup/action model

The bot must never:
- create illegal positions
- create impossible-to-finish states
- bypass backend validation
- place kings early
- break autoplay

## Scope for this sprint
Build only:
1. solo-vs-bot mode
2. side selection for the human: White / Black / Random
3. backend easy bot for setup turns
4. frontend bot-turn handling / disabled state while bot acts
5. tests for legality and setup completion
6. progress logging in `BOT_PROGRESS.md`

## Easy bot expectations
This sprint is easy difficulty only.

That means:
- legal only
- reliable
- simple heuristics are okay
- some randomness is good
- variation is good
- intelligence is less important than correctness

Suggested behavior:
- enumerate legal candidate setup actions
- heavily prefer satisfying mandatory pawns early
- avoid obviously silly king placement
- mildly prefer reasonable squares when possible
- choose among legal weighted candidates

## Code quality
- Prefer small, focused changes.
- Reuse existing rules/service layers.
- Do not duplicate backend rule logic unnecessarily.
- Keep bot logic in dedicated backend modules/services.
- Keep frontend changes minimal and consistent with the current UI.
- Add/update tests for backend logic and setup progression.

## Required outputs
Create/update:
- `BOT_PROGRESS.md`

It should contain:
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
- bot cannot be made reliable without changing core rules
- a change would require multiplayer architecture
- a change would require a broad UI redesign
- autoplay flow becomes unstable

## Validation required before stopping
Run:
- `cd server && .venv/bin/pytest -q`
- `cd client && npm run build`

Before finishing, summarize:
- files changed
- what was implemented
- what still needs manual QA
- any known limitations in the easy bot

## After this sprint
The next milestone should likely be one of:
- medium bot heuristics
- multiplayer room-code mode

Do not start either unless explicitly asked.