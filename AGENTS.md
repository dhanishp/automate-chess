# Automate Chess agent instructions

## Project priorities
This repo is a browser-based Automate-style chess variant.

Current priorities:
1. polish and stabilize the existing setup -> autoplay flow
2. improve visual consistency, especially light mode
3. harden state transitions and interaction reliability
4. preserve the current premium grayscale aesthetic

Do NOT expand scope into:
- multiplayer
- public matchmaking
- accounts/auth
- setup bots
- database persistence
- deployment/infrastructure changes
unless explicitly asked.

## Non-negotiables
- Backend remains source of truth for legality.
- Do not change game rules unless fixing a real bug or impossible state.
- Do not redesign the whole app.
- Preserve the current layout direction unless a change clearly improves density/usability.
- Do not remove working features to simplify implementation.
- Keep the board large and visually dominant.
- Maintain dark mode as the primary visual baseline and make light mode intentionally tuned, not just inverted.

## Code quality
- Prefer small, focused changes.
- Keep components modular.
- Do not introduce large dependencies unless clearly justified.
- Add or update tests when fixing backend logic or fragile interaction flows.
- Avoid dead code and one-off hacks.

## Overnight sprint goals
Work only on:
1. light mode contrast correction and piece readability
2. logo/header refinement and top-level info density
3. replay/result semantics and no-spoiler guarantees
4. king-placement reliability and in-flight interaction locking
5. autoplay/replay polish:
   - clickable move list reliability
   - current move visibility/highlighting
   - spacing/density cleanup
   - skip simulation behavior
6. UI consistency across states:
   - setup
   - calculating
   - autoplay running
   - paused
   - replay complete

## Result semantics
- During setup: no winner/result shown
- During calculating: result unknown/pending
- During autoplay animation: result unknown/pending
- When replay reaches final ply: reveal White wins / Black wins / Draw and keep it visible

## Light mode requirements
- White pieces must remain readable on light squares
- Black pieces must remain readable on dark squares
- Board square values must have stronger separation than they currently do
- Panels/cards/overlays need explicit light-mode tuning, not simple inversion
- Preserve premium feel in light mode

## Branding requirements
- Keep the wordmark "AUTOMATE CHESS"
- Improve the icon/mark with a cleaner knight/cog-style idea if possible
- Keep it minimal, monochrome, and implementable
- Do not make it cartoonish

## Stop conditions
Stop and report instead of continuing if:
- backend tests fail and cannot be fixed confidently
- `npm run build` fails and cannot be fixed confidently
- king placement or autoplay flow becomes unreliable
- a change requires redesigning major architecture
- a change would require introducing multiplayer logic
- light mode still breaks board/piece readability after a reasonable pass

## Required validation before stopping
Before finishing, run:
- backend tests
- frontend build

And summarize:
- files changed
- what was fixed
- what remains imperfect
- any risks or regressions to watch