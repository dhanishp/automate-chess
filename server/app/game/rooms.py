from __future__ import annotations

import random
from typing import Dict
from uuid import uuid4

from app.game.engine import EngineError, EngineProvider, LocalStockfishProvider
from app.game.models import (
    AutoplayState,
    AutoplayStatus,
    CreateRoomRequest,
    GameMode,
    GameState,
    JoinRoomRequest,
    LeaveRoomRequest,
    OpenRoomSummary,
    Phase,
    RoomActionRequest,
    RoomPlayerSnapshot,
    RoomPlayerState,
    RoomResponse,
    RoomSnapshot,
    RoomState,
    RoomStatus,
    RoomVisibility,
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


class RoomNotReadyError(ValueError):
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
            visibility=request.visibility,
            game=game,
            white_player=RoomPlayerState(side=Side.WHITE, player_token=player_token, connected=False),
            black_player=None,
        )
        self._touch_room(room)
        self._rooms[room_code] = room
        return self.room_response("Room created.", room, player_token, Side.WHITE)

    def join_room(self, request: JoinRoomRequest) -> RoomResponse:
        room = self._get_room(request.room_code)
        if room.black_player is not None:
            raise RoomJoinError(f"Room {request.room_code} is already full.")

        player_token = uuid4().hex
        room.black_player = RoomPlayerState(side=Side.BLACK, player_token=player_token, connected=False)
        room.game.event_log.append(f"Black joined room {room.room_code}")
        self._update_room_status(room)
        self._touch_room(room)
        return self.room_response("Joined room.", room, player_token, Side.BLACK)

    def get_room(self, room_code: str, player_token: str) -> RoomResponse:
        room = self._get_room(room_code)
        player_side = self._side_for_token(room, player_token)
        self._normalize_setup_turn(room.game)
        self._update_room_status(room)
        return self.room_response(None, room, player_token, player_side)

    def stats(self) -> dict[str, int]:
        players_online = 0
        occupied_players = 0

        for room in self._rooms.values():
            occupied_players += 1
            if room.white_player.connected:
                players_online += 1
            if room.black_player is not None:
                occupied_players += 1
                if room.black_player.connected:
                    players_online += 1

        return {
            "active_games": len(self._rooms),
            "players_online": players_online,
            "occupied_players": occupied_players,
        }

    def open_rooms(self) -> list[OpenRoomSummary]:
        return [
            OpenRoomSummary(
                room_code=room.room_code,
                status=room.status,
                phase=room.game.phase,
                visibility=room.visibility,
                white_connected=room.white_player.connected,
                black_connected=room.black_player.connected if room.black_player else False,
                setup_turn=room.game.setup_turn,
            )
            for room in self._rooms.values()
            if self._is_public_room_joinable(room)
        ]

    def leave_room(self, room_code: str, request: LeaveRoomRequest) -> tuple[RoomState | None, Side]:
        normalized_room_code = self._normalize_room_code(room_code)
        room = self._get_room(normalized_room_code)
        side = self._side_for_token(room, request.player_token)
        del self._rooms[normalized_room_code]
        return None, side

    def mark_connected(self, room_code: str, player_token: str, connected: bool) -> RoomState:
        room = self._get_room(room_code)
        side = self._side_for_token(room, player_token)
        player = room.white_player if side is Side.WHITE else room.black_player
        assert player is not None
        if player.connected == connected:
            return room
        player.connected = connected
        room.game.event_log.append(f"{side.value} {'connected' if connected else 'disconnected'}")
        self._update_room_status(room)
        self._touch_room(room)
        return room

    def apply_action(self, room_code: str, request: RoomActionRequest, finalize_autoplay: bool = True) -> RoomState:
        room = self._get_room(room_code)
        side = self._side_for_token(room, request.player_token)
        if request.action.side is not side:
            raise RoomAccessError("Players may only submit actions for their assigned side.")
        if room.black_player is None:
            raise RoomNotReadyError("Room is waiting for an opponent. Setup actions unlock after both players join.")

        updated = self._rules_engine.apply_action(room.game.model_copy(deep=True), request.action)
        updated = self._normalize_setup_turn(updated)
        if updated.phase is Phase.READY_FOR_AUTOPLAY and updated.autoplay.status is AutoplayStatus.NOT_READY:
            updated.autoplay = updated.autoplay.model_copy(update={"status": AutoplayStatus.PENDING, "error": None})
        if finalize_autoplay:
            updated = self._finalize_post_setup_or_failure(updated)
        room.game = updated
        self._update_room_status(room)
        self._touch_room(room)
        return room

    def begin_autoplay(self, room_code: str) -> RoomState:
        room = self._get_room(room_code)
        if room.game.phase is Phase.READY_FOR_AUTOPLAY:
            room.game.autoplay = AutoplayState(
                status=AutoplayStatus.RUNNING,
                error=None,
            )
            room.game.phase = Phase.AUTOPLAY
            room.game.event_log.append("Autoplay replay generation started.")
            self._update_room_status(room)
            self._touch_room(room)
        return room

    def finalize_autoplay(self, room_code: str) -> RoomState:
        room = self._get_room(room_code)
        room.game = self._finalize_post_setup_or_failure(room.game)
        self._update_room_status(room)
        self._touch_room(room)
        return room

    def public_room(self, room: RoomState) -> RoomSnapshot:
        return RoomSnapshot(
            room_code=room.room_code,
            version=room.version,
            status=room.status,
            visibility=room.visibility,
            game=room.game,
            white_player=RoomPlayerSnapshot(
                side=room.white_player.side,
                connected=room.white_player.connected,
            ),
            black_player=(
                RoomPlayerSnapshot(
                    side=room.black_player.side,
                    connected=room.black_player.connected,
                )
                if room.black_player
                else None
            ),
        )

    def room_response(
        self,
        message: str | None,
        room: RoomState,
        player_token: str,
        player_side: Side,
    ) -> RoomResponse:
        return RoomResponse(
            message=message,
            room=self.public_room(room),
            player_token=player_token,
            player_side=player_side,
        )

    def _normalize_room_code(self, room_code: str) -> str:
        return room_code.strip().upper()

    def _generate_room_code(self) -> str:
        while True:
            code = "".join(self._rng.choice(ROOM_CODE_ALPHABET) for _ in range(6))
            if code not in self._rooms:
                return code

    def _get_room(self, room_code: str) -> RoomState:
        normalized = self._normalize_room_code(room_code)
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
        if game.phase in {Phase.READY_FOR_AUTOPLAY, Phase.AUTOPLAY} and game.autoplay.status in {
            AutoplayStatus.NOT_READY,
            AutoplayStatus.PENDING,
            AutoplayStatus.RUNNING,
        }:
            game.autoplay = self._engine_provider.generate_autoplay(game)
            game.phase = Phase.AUTOPLAY
            game.result = game.autoplay.result
            game.event_log.append("Autoplay replay generated from the finished setup.")
        return game

    def _finalize_post_setup_or_failure(self, game: GameState) -> GameState:
        try:
            return self._finalize_post_setup(game)
        except EngineError as exc:
            return self._mark_autoplay_failed(game, str(exc))

    def _mark_autoplay_failed(self, game: GameState, error: str) -> GameState:
        game.phase = Phase.AUTOPLAY
        game.autoplay = AutoplayState(status=AutoplayStatus.FAILED, error=error)
        game.result = None
        game.event_log.append(f"Autoplay replay generation failed: {error}")
        return game

    def _touch_room(self, room: RoomState) -> None:
        room.version += 1

    def _is_public_room_joinable(self, room: RoomState) -> bool:
        return (
            room.visibility is RoomVisibility.PUBLIC
            and room.status is RoomStatus.WAITING
            and room.black_player is None
            and room.game.phase is Phase.SETUP
        )

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
