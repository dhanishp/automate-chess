# Friend-Test Polish Progress

## Plan
- Replace the native finish-setup confirmation with an in-app modal.
- Make multiplayer setup transitions, room status wording, and turn-disabled states clearer.
- Add legal placement highlights without changing backend legality.
- Polish replay controls and add a copyable replay move list.
- Improve SVG piece readability and setup-side point clarity.
- Keep validation, build, and deployment paths intact.

## Files changed
- `client/src/screens/App.tsx`
- `client/src/components/AppHeader.tsx`
- `client/src/components/Board.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/components/AutoplayViewer.tsx`
- `client/src/components/PieceGlyph.tsx`
- `client/src/theme/styles.css`
- `FRIEND_TEST_POLISH.md`

## Completed
- Replaced `window.confirm` finish setup with an in-app confirmation modal.
- Added conservative legal placement square highlights for the active selected piece or king placement mode.
- Tightened setup controls so multiplayer opponent turns and bot turns disable piece/shop actions clearly.
- Updated setup board heading copy to show waiting, opponent, bot, side, and selected-piece context.
- Removed redundant in-game setup/calculating/autoplay top status pills while keeping the room connection pill.
- Added green/amber/red room connection pill tones for connected, connecting, and disconnected states.
- Added a shared calculating latch from room snapshots so both multiplayer clients show the calculating overlay during final-king autoplay generation.
- Updated room closed/reconnect copy and removed the confusing "Retry restore" wording.
- Remembered selected setup piece per side for local/solo sandbox and bot human turns.
- Added side-coded White/Black point cards.
- Collapsed duplicate pawn requirement copy into one validation note.
- Grouped replay back/pause-forward controls with inline SVG symbols and separated restart/skip/menu actions.
- Added "Copy move list" replay export with result, starting FEN, final FEN, and numbered SAN/UCI moves.
- Refined SVG king cross styling and made the knight silhouette more horse-like.
- Added optional invite link copy and `?room=ABC123` join-code prefill.

## Intentionally deferred
- Full reconnect/session recovery UX beyond existing room restore and clearer wording.
- Public matchmaking, accounts, persistence, or open room discovery.
- A full PGN exporter, because custom setup positions make "PGN" labeling misleading.
- Broad UI redesign or new game rules.

## Validation results
- `cd server && .venv/bin/pytest -q`
  - Passed: `37 passed in 1.39s`
- `cd client && npm run build`
  - Passed: TypeScript and Vite production build succeeded.
  - Output summary: `38 modules transformed`, `dist/assets/index-CEWJFXHe.css 27.02 kB`, `dist/assets/index-13bYoWb5.js 196.74 kB`, `built in 842ms`.
- `git diff --check`
  - Passed with no whitespace errors.

## Manual QA checklist
- Local sandbox: select different pieces for White and Black, switch turns, and verify each side remembers its selected piece.
- Finish setup: confirm the modal appears only when legal, Cancel closes it, and Finish setup advances correctly.
- Multiplayer: create room, copy invite link, join from `?room=CODE`, and verify setup actions stay disabled before join and on opponent turns.
- Multiplayer transition: place the final king from each side in separate runs and verify both clients show "Calculating autoplay..." until replay ready or failed.
- Multiplayer disconnect/leave: verify remaining client sees clear room-closed/opponent-left language.
- Replay: pause, step back, step forward, restart, skip simulation, and copy move list in a modern browser.
- Mobile Safari/manual responsive pass: setup board highlights, modal, replay controls, and room code/invite UI.

## Deployment readiness
- Safe for a friend-test redeploy after a quick manual multiplayer smoke test on Render.
- The Render deployment path was preserved; no backend deployment settings or game rules were changed.
