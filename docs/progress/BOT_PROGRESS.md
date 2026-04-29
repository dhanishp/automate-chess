# Bot Progress

## Plan
1. Add backend game-mode metadata for local vs bot games, including human side, bot side, and random-side resolution.
2. Implement an easy setup bot in a dedicated backend module that enumerates legal setup actions, validates them through existing rules, and chooses among weighted reasonable options.
3. Make the backend automatically advance bot turns after game creation and after each human setup action until it is the human's turn again or setup completes.
4. Add backend tests for bot legality, rule compliance, continued setup progression, and full human-vs-bot progression into autoplay.
5. Add minimal frontend mode/side selection, bot-turn status, and disabled interaction while the bot is acting.
6. Validate with backend tests and frontend build, then summarize files changed, what passed, and manual QA notes.

## Progress
- Plan recorded before implementation.
- Added backend bot-game metadata and request fields for `local` vs `bot`, plus human side selection (`white`, `black`, `random`).
- Implemented `server/app/game/bot.py` with an easy setup bot that enumerates legal actions through the existing rules engine, prefers mandatory pawns early, weights sane placements, and handles finish/king actions when legal.
- Updated `GameService` so bot turns auto-run after game creation and after each human setup action until it is the human's turn again or setup reaches autoplay.
- Added backend bot tests covering legal move generation, repeated legal progression, bot-first starts, and full bot-game progression into autoplay.
- Found and fixed a real setup-turn bug in `AutomateRulesEngine`: once one side had finished spending and placed its king, turn advancement could still bounce back to that completed side and dead-end setup. Completed sides are now skipped until the other side finishes.
- Added a rules regression test for the completed-side turn-skip behavior.
- Added frontend game launcher support for `Solo Sandbox` vs `Solo vs Bot`, including human side choice in bot mode.
- Frontend now reads bot metadata from the API, disables setup interactions while bot responses are in flight, and shows compact bot-turn status in the sidebar without redesigning the existing board/sidebar layout.
- Preserved existing autoplay/replay flow; once setup finishes with both kings, the current autoplay path still begins normally.
- Added a short frontend bot-think delay so bot setup turns feel intentional instead of instant, while keeping human controls locked during the wait.
- Added `Back to menu` controls so the current game session can be cleared cleanly from setup, autoplay-pending, and replay states.
- Retuned replay speeds so `Fast` is meaningfully faster than `Normal`.
- Audited the rare end-of-setup stall path. I did not reproduce a new deterministic White-side one-point bug beyond the completed-side turn issue already fixed, but I added a small `GameService` safeguard that normalizes the active setup turn away from a side that has already fully completed setup. There is now a regression test covering that repair path.

## Files Changed
- `BOT_PROGRESS.md`
- `server/app/game/models.py`
- `server/app/game/bot.py`
- `server/app/game/rules.py`
- `server/app/game/service.py`
- `server/app/main.py`
- `server/tests/test_bot.py`
- `server/tests/test_rules.py`
- `client/src/lib/api.ts`
- `client/src/screens/App.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/components/AutoplayViewer.tsx`
- `client/src/theme/styles.css`

## Validation
- `cd server && .venv/bin/pytest -q` -> `22 passed`
- `cd client && npm run build` -> passed

## Remaining Manual QA
- Browser-check the launcher flow for all three bot-side choices (`White`, `Black`, `Random`), especially the immediate bot-first opening when the human chooses Black.
- Play through at least one full solo-vs-bot setup to confirm the pending label and disabled board feel clear while waiting on the bot response.
- Quick browser feel-check that the bot delay still feels snappy and that `Fast` replay is now clearly distinct from `Normal`.
- Sanity-check that loading the existing sample setup from the sidebar still behaves as expected, since it intentionally remains a separate setup utility rather than a bot-mode shortcut.

## Recommended Next Milestone
- Solo bot setup generation tuning: improve bot opening variety and add a simple frontend surface for bot difficulty selection once the easy baseline has been manually validated.
