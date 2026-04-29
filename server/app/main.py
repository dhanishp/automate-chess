from collections import defaultdict
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.game.bot import BotMoveError
from app.game.engine import EngineError, EngineUnavailableError
from app.game.models import (
    ActionRequest,
    ApiResponse,
    CreateRoomRequest,
    CreateSampleGameRequest,
    CreateSoloGameRequest,
    JoinRoomRequest,
    LeaveRoomRequest,
    Phase,
    RoomActionRequest,
    RoomEvent,
    RoomResponse,
    RoomSnapshot,
    RoomState,
)
from app.game.presets import PresetNotFoundError
from app.game.rooms import RoomAccessError, RoomJoinError, RoomNotFoundError, RoomNotReadyError, RoomService
from app.game.rules import RuleViolation
from app.game.service import service

app = FastAPI(title="Automate Chess API", version="0.1.0")
room_service = RoomService()
CLIENT_DIST_DIR = Path(__file__).resolve().parents[2] / "client" / "dist"


class RoomHub:
    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, room_code: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[room_code].append(websocket)

    def disconnect(self, room_code: str, websocket: WebSocket) -> None:
        connections = self._connections.get(room_code, [])
        if websocket in connections:
            connections.remove(websocket)
        if not connections and room_code in self._connections:
            del self._connections[room_code]

    async def broadcast_snapshot(self, room: RoomState | RoomSnapshot) -> None:
        snapshot = room_service.public_room(room) if isinstance(room, RoomState) else room
        event = RoomEvent(type="snapshot", room=snapshot)
        for websocket in list(self._connections.get(snapshot.room_code, [])):
            await websocket.send_json(event.model_dump(mode="json"))

    async def broadcast_closed(self, room_code: str, message: str) -> None:
        event = RoomEvent(type="room_closed", room_code=room_code, message=message)
        for websocket in list(self._connections.get(room_code, [])):
            await websocket.send_json(event.model_dump(mode="json"))


room_hub = RoomHub()

# Local frontend dev runs on Vite, so allow those origins during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_origin_regex=r"http://(?:localhost|127\.0\.0\.1|(?:\d{1,3}\.){3}\d{1,3}):5173",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/games/solo", response_model=ApiResponse)
async def create_solo_game(request: CreateSoloGameRequest) -> ApiResponse:
    game = service.create_solo_game(request)
    return ApiResponse(message="Solo game created.", game=game)


@app.post("/games/sample", response_model=ApiResponse)
async def create_sample_game(request: CreateSampleGameRequest) -> ApiResponse:
    try:
        game = service.create_sample_game(request)
    except PresetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ApiResponse(message="Sample game created.", game=game)


@app.get("/games/{game_id}", response_model=ApiResponse)
async def get_game(game_id: str) -> ApiResponse:
    try:
        game = service.get_game(game_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ApiResponse(game=game)


@app.post("/games/{game_id}/actions", response_model=ApiResponse)
async def apply_action(game_id: str, request: ActionRequest) -> ApiResponse:
    try:
        game = service.apply_action(game_id, request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuleViolation as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except BotMoveError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except EngineUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except EngineError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return ApiResponse(message="Action applied.", game=game)


@app.post("/rooms", response_model=RoomResponse)
async def create_room(request: CreateRoomRequest) -> RoomResponse:
    response = room_service.create_room(request)
    return response


@app.post("/rooms/join", response_model=RoomResponse)
async def join_room(request: JoinRoomRequest) -> RoomResponse:
    try:
        response = room_service.join_room(request)
    except RoomNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RoomJoinError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await room_hub.broadcast_snapshot(response.room)
    return response


@app.get("/rooms/{room_code}", response_model=RoomResponse)
async def get_room(room_code: str, player_token: str) -> RoomResponse:
    try:
        return room_service.get_room(room_code, player_token)
    except RoomNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RoomAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@app.post("/rooms/{room_code}/actions", response_model=RoomResponse)
async def apply_room_action(room_code: str, request: RoomActionRequest) -> RoomResponse:
    try:
        room = room_service.apply_action(room_code, request, finalize_autoplay=False)
        player_side = room_service.get_room(room_code, request.player_token).player_side
    except RoomNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RoomAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except RoomNotReadyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuleViolation as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except EngineUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except EngineError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    await room_hub.broadcast_snapshot(room)

    if room.game.phase is Phase.READY_FOR_AUTOPLAY:
        room = room_service.begin_autoplay(room_code)
        await room_hub.broadcast_snapshot(room)
        room = room_service.finalize_autoplay(room_code)

    await room_hub.broadcast_snapshot(room)
    return room_service.room_response("Room action applied.", room, request.player_token, player_side)


@app.post("/rooms/{room_code}/leave")
async def leave_room(room_code: str, request: LeaveRoomRequest) -> dict[str, str]:
    try:
        room, side = room_service.leave_room(room_code, request)
    except RoomNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RoomAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    if room is None:
        await room_hub.broadcast_closed(room_code.strip().upper(), f"{side.value.capitalize()} left. Room closed.")
        return {"status": "closed"}

    await room_hub.broadcast_snapshot(room)
    return {"status": "ok"}


@app.websocket("/rooms/{room_code}/ws")
async def room_websocket(websocket: WebSocket, room_code: str, player_token: str) -> None:
    normalized_room_code = room_code.strip().upper()
    try:
        room = room_service.mark_connected(normalized_room_code, player_token, True)
    except (RoomNotFoundError, RoomAccessError):
        await websocket.close(code=4404)
        return

    await room_hub.connect(normalized_room_code, websocket)
    await room_hub.broadcast_snapshot(room)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        room_hub.disconnect(normalized_room_code, websocket)
        try:
            room = room_service.mark_connected(normalized_room_code, player_token, False)
        except (RoomNotFoundError, RoomAccessError):
            return
        await room_hub.broadcast_snapshot(room)


if os.getenv("SERVE_CLIENT_DIST") == "1" and CLIENT_DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=CLIENT_DIST_DIR, html=True), name="client")
