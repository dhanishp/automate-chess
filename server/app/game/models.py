from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Side(str, Enum):
    WHITE = "white"
    BLACK = "black"

    @property
    def opposite(self) -> "Side":
        return Side.BLACK if self is Side.WHITE else Side.WHITE


class Phase(str, Enum):
    SETUP = "setup"
    READY_FOR_AUTOPLAY = "ready_for_autoplay"
    AUTOPLAY = "autoplay"
    RESULTS = "results"


class GameMode(str, Enum):
    LOCAL = "local"
    BOT = "bot"
    MULTIPLAYER = "multiplayer"


class HumanSideChoice(str, Enum):
    WHITE = "white"
    BLACK = "black"
    RANDOM = "random"


class AutoplayStatus(str, Enum):
    NOT_READY = "not_ready"
    PENDING = "pending"
    RUNNING = "running"
    READY = "ready"
    FAILED = "failed"


class ActionType(str, Enum):
    PLACE_PIECE = "place_piece"
    FINISH_SETUP = "finish_setup"
    PLACE_KING = "place_king"


class PieceType(str, Enum):
    PAWN = "P"
    KNIGHT = "N"
    BISHOP = "B"
    ROOK = "R"
    QUEEN = "Q"
    KING = "K"


class PlacedPiece(BaseModel):
    type: PieceType
    square: str


class PlayerSetupState(BaseModel):
    side: Side
    points_remaining: int
    finished_spending: bool = False
    pieces: list[PlacedPiece] = Field(default_factory=list)
    king_square: str | None = None

    @property
    def mandatory_pawn_count(self) -> int:
        return sum(1 for piece in self.pieces if piece.type == PieceType.PAWN)


class GameRules(BaseModel):
    id: str = "automate_classic"
    budget: int = 35
    mandatory_pawns: int = 6
    costs: dict[PieceType, int] = Field(
        default_factory=lambda: {
            PieceType.PAWN: 1,
            PieceType.KNIGHT: 3,
            PieceType.BISHOP: 3,
            PieceType.ROOK: 4,
            PieceType.QUEEN: 7,
            PieceType.KING: 0,
        }
    )
    pawn_ranks: dict[Side, set[int]] = Field(
        default_factory=lambda: {Side.WHITE: {2, 3}, Side.BLACK: {6, 7}}
    )
    non_king_ranks: dict[Side, set[int]] = Field(
        default_factory=lambda: {Side.WHITE: {1, 2}, Side.BLACK: {7, 8}}
    )
    king_ranks: dict[Side, set[int]] = Field(
        default_factory=lambda: {Side.WHITE: {1, 2}, Side.BLACK: {7, 8}}
    )
    white_moves_first: bool = True
    castling_enabled: bool = False


class GameState(BaseModel):
    game_id: str = Field(default_factory=lambda: uuid4().hex[:10])
    mode: GameMode = GameMode.LOCAL
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    human_side: Side | None = None
    bot_side: Side | None = None
    phase: Phase = Phase.SETUP
    setup_turn: Side = Side.WHITE
    white: PlayerSetupState = Field(
        default_factory=lambda: PlayerSetupState(side=Side.WHITE, points_remaining=35)
    )
    black: PlayerSetupState = Field(
        default_factory=lambda: PlayerSetupState(side=Side.BLACK, points_remaining=35)
    )
    rules: GameRules = Field(default_factory=GameRules)
    event_log: list[str] = Field(default_factory=list)
    result: str | None = None
    autoplay: "AutoplayState" = Field(default_factory=lambda: AutoplayState())

    def player(self, side: Side) -> PlayerSetupState:
        return self.white if side is Side.WHITE else self.black

    @model_validator(mode="after")
    def sync_points(self) -> "GameState":
        self.white.points_remaining = min(self.white.points_remaining, self.rules.budget)
        self.black.points_remaining = min(self.black.points_remaining, self.rules.budget)
        return self


class CreateSoloGameRequest(BaseModel):
    white_name: str = "White"
    black_name: str = "Bot"
    mode: GameMode = GameMode.LOCAL
    human_side: HumanSideChoice = HumanSideChoice.WHITE


class CreateSampleGameRequest(BaseModel):
    preset_id: str = "quickstart"
    mode: GameMode = GameMode.LOCAL
    human_side: HumanSideChoice = HumanSideChoice.WHITE


class ActionRequest(BaseModel):
    action_type: ActionType
    side: Side
    piece_type: PieceType | None = None
    square: str | None = None

    @model_validator(mode="after")
    def validate_action_shape(self) -> "ActionRequest":
        if self.action_type == ActionType.PLACE_PIECE:
            if self.piece_type in (None, PieceType.KING) or self.square is None:
                raise ValueError("place_piece requires a non-king piece_type and a square")
        if self.action_type == ActionType.PLACE_KING:
            if self.square is None:
                raise ValueError("place_king requires a square")
        return self


class ApiResponse(BaseModel):
    ok: bool = True
    message: str | None = None
    game: GameState


class RoomStatus(str, Enum):
    WAITING = "waiting"
    ACTIVE = "active"
    COMPLETE = "complete"


class RoomVisibility(str, Enum):
    PRIVATE = "private"
    PUBLIC = "public"


class RoomPlayerState(BaseModel):
    side: Side
    player_token: str
    connected: bool = False


class RoomState(BaseModel):
    room_code: str
    version: int = 0
    status: RoomStatus
    visibility: RoomVisibility = RoomVisibility.PRIVATE
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    last_activity_at: datetime = Field(default_factory=utc_now)
    game: GameState
    white_player: RoomPlayerState
    black_player: RoomPlayerState | None = None


class RoomPlayerSnapshot(BaseModel):
    side: Side
    connected: bool = False


class RoomSnapshot(BaseModel):
    room_code: str
    version: int = 0
    status: RoomStatus
    visibility: RoomVisibility = RoomVisibility.PRIVATE
    game: GameState
    white_player: RoomPlayerSnapshot
    black_player: RoomPlayerSnapshot | None = None


class CreateRoomRequest(BaseModel):
    white_name: str = "White"
    black_name: str = "Black"
    visibility: RoomVisibility = RoomVisibility.PRIVATE


class OpenRoomSummary(BaseModel):
    room_code: str
    status: RoomStatus
    phase: Phase
    visibility: RoomVisibility
    white_connected: bool
    black_connected: bool
    setup_turn: Side


class JoinRoomRequest(BaseModel):
    room_code: str


class LeaveRoomRequest(BaseModel):
    player_token: str


class RoomActionRequest(BaseModel):
    player_token: str
    action: ActionRequest


class RoomResponse(BaseModel):
    ok: bool = True
    message: str | None = None
    room: RoomSnapshot
    player_token: str
    player_side: Side


class RoomEvent(BaseModel):
    type: Literal["snapshot", "room_closed"]
    room: RoomSnapshot | None = None
    room_code: str | None = None
    message: str | None = None


class ReplayMove(BaseModel):
    ply: int
    uci: str
    san: str
    fen_after: str


class AutoplayState(BaseModel):
    status: AutoplayStatus = AutoplayStatus.NOT_READY
    initial_fen: str | None = None
    moves: list[ReplayMove] = Field(default_factory=list)
    final_fen: str | None = None
    result: str | None = None
    error: str | None = None
