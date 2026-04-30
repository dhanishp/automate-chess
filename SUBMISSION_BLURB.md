# Submission Blurb

Automate Chess is a browser-based rebuild of a Chess.com-style Automate mode I missed after it disappeared around 2022. Players spend a point budget to build custom formations, place their kings last, and then Stockfish resolves the finished position as a battle simulation.

The app supports solo sandbox, singleplayer vs bot, local setup, room-code multiplayer, public Open Games, invite links, legal placement highlights, SVG pieces, battle playback controls, and copyable move/battle notation. It is deployed publicly on Render as a single FastAPI service that serves the React/Vite/TypeScript frontend, handles WebSockets, and runs Stockfish through `python-chess`.

I focused on making the core loop playable end to end: build, lock, calculate, watch the battle, and share with another person online. The backend is authoritative for setup legality and multiplayer turn order, and production includes Docker packaging plus `/health` and `/ready` checks for cold-start and Stockfish readiness.

Current limitations are intentional for this challenge version: rooms are in memory, deployment is single-instance only, rooms disappear on restart, there are no accounts or persistent matchmaking, and multiplayer playback controls are local per client.

3-minute demo:

1. Show launcher, engine readiness, live stats, modes, and Open Games.
2. Build a formation in solo or bot mode using the point budget and legal highlights.
3. Place kings last and show the Stockfish battle simulation plus move-list copy.
4. Create or join a multiplayer room with an invite link or Open Games.
5. End with the honest v1 limitations and deployment shape.
