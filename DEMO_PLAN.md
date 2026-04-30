# Demo Plan

## Before Recording Or Presenting

- Open the deployed app once to wake the Render service.
- Visit `/ready` and confirm Stockfish reports ready.
- Open two browser windows or profiles if demonstrating multiplayer.
- Keep one room code or invite link flow ready in case public Open Games is empty.

## 3-Minute Demo Script

### 0:00-0:25 - Intro

Say:

> This is Automate Chess, a browser-based rebuild of a Chess.com-style Automate mode I missed after it disappeared around 2022. Instead of playing moves directly, you build a formation with a point budget, place kings last, and Stockfish resolves the battle.

Show:

- Launcher.
- Engine readiness indicator.
- Live activity pill.
- Mode options.

### 0:25-1:10 - Build A Formation

Action:

- Start Solo Sandbox or Singleplayer vs Bot.
- Select a few pieces from the shop.
- Show remaining points.
- Place pieces on highlighted legal squares.
- Point out that pawns and ranks are constrained by the setup rules.
- Finish setup and place the king last.

Say:

> The backend is authoritative for legality and turn order. The frontend helps by highlighting legal squares, but the server still validates every action.

### 1:10-1:50 - Stockfish Battle Simulation

Action:

- Place the final king.
- Show the calculating battle state.
- Let the battle simulation appear.
- Use pause, step, speed, restart/watch-again, or skip controls.
- Open/copy the move list if available.

Say:

> Once both kings are placed, the setup locks and Stockfish resolves the position. The battle notation is shareable as a move list, but this is not claimed as full PGN because the starting positions are custom.

### 1:50-2:35 - Multiplayer

Action:

- Return to menu.
- Create a multiplayer room.
- Show private/public toggle.
- Copy invite link, or create a public room and show it in Open Games from the second browser.
- Join from the second browser.
- Place one piece from each side to show synchronized setup.

Say:

> Multiplayer is room-code based, with invite links and a lightweight Open Games list for public rooms. Room state is synchronized over WebSockets, and player tokens are not exposed to the opponent.

### 2:35-3:00 - Deployment And Limitations

Show:

- Mention deployed Render URL.
- Mention `/health` and `/ready`.

Say:

> The app is deployed as a single FastAPI service on Render. It serves the React frontend, handles WebSockets, and includes Stockfish in Docker. The current version is intentionally simple: rooms are in memory, single-instance only, no accounts, no persistent matchmaking, and playback controls are local per client.

## Optional Demo Beats

- Show public Open Games appearing/disappearing when a second player joins.
- Demonstrate room leave behavior returning the other player to menu.
- Demonstrate light/dark mode only if there is spare time.
- Show sample setup if manual formation building is taking too long.

## Avoid During Demo

- Do not spend too long optimizing a formation.
- Do not claim persistence, accounts, ranking, or full matchmaking.
- Do not open multiple stale rooms before the demo unless you want them visible in Live Now.
- Do not rely on Render free-tier cold start happening quickly; warm the app first.
