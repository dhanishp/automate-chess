# Automate Chess: Handshake Summary

## Project

Automate Chess is a browser-based rebuild of a Chess.com-style Automate mode I missed after it disappeared around 2022.

The idea is simple: players spend a fixed point budget to build custom chess formations, place their kings last, and then let a chess engine resolve the battle automatically. Instead of playing move by move, the player is designing the starting army and watching the consequences.

## Why I Built It

I wanted to bring back the feeling of Automate chess: the mix of puzzle, drafting, and chaos where the interesting choice happens before the first move. The challenge was to make that mode feel playable in a modern browser, with enough structure for solo testing and enough multiplayer support to send to friends.

## What It Supports

- Solo sandbox for experimenting with both sides.
- Singleplayer vs bot setup mode.
- Local same-device two-player setup.
- Room-code multiplayer with WebSocket sync.
- Public/private room creation and an Open Games list.
- Invite links for direct room joins.
- Server-authoritative legality and setup turn order.
- Legal placement highlights during setup.
- SVG chess pieces controlled by the app.
- Stockfish battle simulation after both kings are placed.
- Battle playback controls, including pause, step, speed, restart, skip, and watch again.
- Copyable move/battle notation.
- Public Render deployment path with Docker and Stockfish included.
- `/health` and `/ready` checks, including lightweight Stockfish readiness.

## Technical Stack

- Backend: FastAPI.
- Frontend: React, Vite, TypeScript.
- Realtime multiplayer: WebSockets, with polling/restore fallback behavior.
- Chess engine integration: Stockfish through `python-chess`.
- Deployment: Docker on Render as a single FastAPI service serving the built React frontend.
- Runtime model: in-memory game and room state for the current single-instance version.

## Interesting Technical Work

- Built a server-authoritative setup rules engine so the frontend cannot invent illegal placements or turn order.
- Added synchronized room state and token-redacted room snapshots so each player can act only as their assigned side.
- Made multiplayer setup and battle-generation transitions shared, including failure states when Stockfish is missing or fails.
- Added public Open Games without exposing room/player tokens or adding accounts.
- Hardened deployment with a single-origin production setup, WebSocket compatibility, Stockfish installation, and readiness checks.
- Added active game/player stats while keeping the implementation intentionally simple for single-instance deployment.

## Honest Limitations

- Rooms and games are in memory only.
- Deployment is single-instance only; horizontal scaling would require shared state.
- Rooms disappear on server restart, redeploy, crash, or free-host sleep.
- There are no accounts, profiles, matchmaking queues, or persistent room history.
- Public Open Games is a lightweight list of joinable public rooms, not a full matchmaking system.
- Multiplayer battle data is shared, but playback controls are local per client.
- Render free hosting can sleep and cold start, so demos should warm `/ready` first.

## 3-Minute Demo Outline

1. Show the launcher: point out engine readiness, live activity, solo modes, multiplayer, and Open Games.
2. Start a solo sandbox or singleplayer vs bot game: buy pieces, show point budget, legal highlights, and place kings last.
3. Let Stockfish resolve the completed position: show calculating state, battle controls, and copy move list.
4. Show multiplayer briefly: create a public or private room, copy invite link, join from another browser, and point out synchronized setup.
5. Close with limitations: single-instance, in-memory rooms, no accounts, and playback controls are local.

## Submission Framing

Automate Chess is not trying to be a full chess platform. It is a focused, playable reconstruction of a mode I missed, packaged as a browser app that can be tested publicly. The goal was to make the core loop work end to end: build a formation, place kings, resolve with Stockfish, watch the battle, and make that experience shareable with another person online.
