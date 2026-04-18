from __future__ import annotations

import random
from typing import Dict
from uuid import uuid4

from app.game.engine import EngineProvider, LocalStockfishProvider
from app.game.models import (
    CreateRoomRequest,
    GameMode,
    GameState,
    JoinRoomRequest,
    LeaveRoomRequest,
    Phase,
    RoomActionRequest,
    RoomPlayerState,
    RoomResponse,
    RoomState,
    RoomStatus,
    Side,
)
from app.game.rules import AutomateRulesEngine


ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class RoomNotFoundError(KeyError):
    pass


class RoomJoinError(ValueError):
    pass


class RoomAccessError(PermissionError):
    pass


class RoomService:
    def __init__(self, engine_provider: EngineProvider | None = None, rng: random.Random | None = None) -> None:
        self._rooms: Dict[str, RoomState] = {}
        self._rules_engine = AutomateRulesEngine()
        self._engine_provider = engine_provider or LocalStockfishProvider()
        self._rng = rng or random.Random()

    def create_room(self, request: CreateRoomRequest) -> RoomResponse:
        room_code = self._generate_room_code()
        player_token = uuid4().hex
        game = GameState(mode=GameMode.MULTIPLAYER)
        game.event_log.append(f"Created multiplayer room {room_code}: {request.white_name} vs {request.black_name}")
        room = RoomState(
            room_code=room_code,
            status=RoomStatus.WAITING,
            game=game,
            white_player=RoomPlayerState(side=Side.WHITE, player_token=player_token, connected=False),
            black_player=None,
        )
        self._rooms[room_code] = room
        return RoomResponse(message="Room created.", room=room, player_token=player_token, player_side=Side.WHITE)

    def join_room(self, request: JoinRoomRequest) -> RoomResponse:
        room = self._get_room(request.room_code)
        if room.black_player is not None:
            raise RoomJoinError(f"Room {request.room_code} is already full.")

        player_token = uuid4().hex
        room.black_player = RoomPlayerState(side=Side.BLACK, player_token=player_token, connected=False)
        room.game.event_log.append(f"Black joined room {room.room_code}")
        self._update_room_status(room)
        return RoomResponse(message="Joined room.", room=room, player_token=player_token, player_side=Side.BLACK)

    def get_room(self, room_code: str, player_token: str) -> RoomResponse:
        room = self._get_room(room_code)
        player_side = self._side_for_token(room, player_token)
        self._normalize_setup_turn(room.game)
        self._update_room_status(room)
        return RoomResponse(room=room, player_token=player_token, player_side=player_side)

    def leave_room(self, room_code: str, request: LeaveRoomRequest) -> tuple[RoomState | None, Side]:
        room = self._get_room(room_code)
        side = self._side_for_token(room, request.player_token)

        if side is Side.WHITE:
            del self._rooms[room_code]
            return None, side

        room.black_player = None
        room.game.event_log.append("Black left the room.")
        self._update_room_status(room)
        return room, side

    def mark_connected(self, room_code: str, player_token: str, connected: bool) -> RoomState:
        room = self._get_room(room_code)
        side = self._side_for_token(room, player_token)
        player = room.white_player if side is Side.WHITE else room.black_player
        assert player is not None
        player.connected = connected
        room.game.event_log.append(f"{side.value} {'connected' if connected else 'disconnected'}")
        self._update_room_status(room)
        return room

    def apply_action(self, room_code: str, request: RoomActionRequest) -> RoomState:
        room = self._get_room(room_code)
        side = self._side_for_token(room, request.player_token)
        if request.action.side is not side:
            raise RoomAccessError("Players may only submit actions for their assigned side.")

        updated = self._rules_engine.apply_action(room.game.model_copy(deep=True), request.action)
        updated = self._normalize_setup_turn(updated)
        updated = self._finalize_post_setup(updated)
        room.game = updated
        self._update_room_status(room)
        return room

    def _generate_room_code(self) -> str:
        while True:
            code = "".join(self._rng.choice(ROOM_CODE_ALPHABET) for _ in range(6))
            if code not in self._rooms:
                return code

    def _get_room(self, room_code: str) -> RoomState:
        normalized = room_code.strip().upper()
        try:
            return self._rooms[normalized]
        except KeyError as exc:
            raise RoomNotFoundError(f"Room {normalized} does not exist.") from exc

    def _side_for_token(self, room: RoomState, player_token: str) -> Side:
        if room.white_player.player_token == player_token:
            return Side.WHITE
        if room.black_player and room.black_player.player_token == player_token:
            return Side.BLACK
        raise RoomAccessError("Player token is not valid for this room.")

    def _update_room_status(self, room: RoomState) -> None:
        if room.game.phase is Phase.AUTOPLAY:
            room.status = RoomStatus.COMPLETE
            return
        if room.black_player is None:
            room.status = RoomStatus.WAITING
            return
        room.status = RoomStatus.ACTIVE

    def _finalize_post_setup(self, game: GameState) -> GameState:
        if game.phase == Phase.READY_FOR_AUTOPLAY:
            game.autoplay = self._engine_provider.generate_autoplay(game)
            game.phase = Phase.AUTOPLAY
            game.result = game.autoplay.result
            game.event_log.append("Autoplay replay generated from the finished setup.")
        return game

    def _normalize_setup_turn(self, game: GameState) -> GameState:
        if game.phase is not Phase.SETUP:
            return game

        current_player = game.player(game.setup_turn)
        opposing_side = game.setup_turn.opposite
        opposing_player = game.player(opposing_side)

        current_complete = self._is_side_setup_complete(current_player)
        opposing_complete = self._is_side_setup_complete(opposing_player)

        if current_complete and not opposing_complete:
            if game.setup_turn is not opposing_side:
                game.setup_turn = opposing_side
                game.event_log.append(
                    f"Setup turn advanced to {opposing_side.value} to avoid a completed-side stall."
                )
        return game

    def _is_side_setup_complete(self, player) -> bool:  # noqa: ANN001
        spending_complete = player.finished_spending or player.points_remaining == 0
        return spending_complete and player.king_square is not None
