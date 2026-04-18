from __future__ import annotations

import chess

from app.game.models import (
    ActionRequest,
    ActionType,
    GameState,
    Phase,
    PieceType,
    PlacedPiece,
    PlayerSetupState,
    Side,
)


class RuleViolation(ValueError):
    pass


FILES = set("abcdefgh")


class AutomateRulesEngine:
    def apply_action(self, game: GameState, action: ActionRequest) -> GameState:
        if game.phase != Phase.SETUP:
            raise RuleViolation("Setup actions are only allowed during the setup phase.")
        if action.side != game.setup_turn:
            raise RuleViolation(f"It is {game.setup_turn.value}'s turn.")

        match action.action_type:
            case ActionType.PLACE_PIECE:
                self._place_piece(game, action.side, action.piece_type, action.square)
            case ActionType.FINISH_SETUP:
                self._finish_setup(game, action.side)
            case ActionType.PLACE_KING:
                self._place_king(game, action.side, action.square)
            case _:
                raise RuleViolation("Unsupported action.")

        self._advance_turn_or_phase(game)
        return game

    def _place_piece(self, game: GameState, side: Side, piece_type: PieceType | None, square: str | None) -> None:
        assert piece_type is not None
        assert square is not None
        if piece_type == PieceType.KING:
            raise RuleViolation("The king must be placed with the place_king action.")

        player = game.player(side)
        if player.finished_spending:
            raise RuleViolation("This player already finished spending.")

        normalized_square = self._normalize_square(square)
        rank = int(normalized_square[1])
        self._ensure_square_available(game, normalized_square)

        if piece_type == PieceType.PAWN:
            allowed_ranks = game.rules.pawn_ranks[side]
        else:
            allowed_ranks = game.rules.non_king_ranks[side]

        if rank not in allowed_ranks:
            raise RuleViolation(f"{piece_type.value} cannot be placed on {normalized_square} for {side.value}.")

        cost = game.rules.costs[piece_type]
        if cost > player.points_remaining:
            raise RuleViolation("Not enough points remaining for that piece.")

        player.pieces.append(PlacedPiece(type=piece_type, square=normalized_square))
        player.points_remaining -= cost
        game.event_log.append(f"{side.value} placed {piece_type.value} on {normalized_square}")

    def _finish_setup(self, game: GameState, side: Side) -> None:
        player = game.player(side)
        if player.finished_spending:
            raise RuleViolation("This player already finished spending.")
        if player.mandatory_pawn_count < game.rules.mandatory_pawns:
            raise RuleViolation(
                f"{side.value.capitalize()} must place at least {game.rules.mandatory_pawns} pawns before finishing setup."
            )
        player.finished_spending = True
        game.event_log.append(f"{side.value} finished spending with {player.points_remaining} points remaining")

    def _place_king(self, game: GameState, side: Side, square: str | None) -> None:
        assert square is not None
        player = game.player(side)
        if player.king_square is not None:
            raise RuleViolation("King already placed.")
        if not self._can_place_king(game, side):
            raise RuleViolation("Player is not yet eligible to place the king.")

        normalized_square = self._normalize_square(square)
        rank = int(normalized_square[1])
        if rank not in game.rules.king_ranks[side]:
            raise RuleViolation(f"King cannot be placed on {normalized_square} for {side.value}.")
        self._ensure_square_available(game, normalized_square)

        if self._king_in_check_after_placement(game, side, normalized_square):
            opponent = side.opposite
            game.phase = Phase.RESULTS
            game.result = f"{opponent.value}_wins_by_illegal_king_check"
            game.event_log.append(f"{side.value} lost immediately by placing king in check on {normalized_square}")
            return

        player.king_square = normalized_square
        game.event_log.append(f"{side.value} placed king on {normalized_square}")

    def _advance_turn_or_phase(self, game: GameState) -> None:
        if game.phase == Phase.RESULTS:
            return
        if game.white.king_square and game.black.king_square:
            game.phase = Phase.READY_FOR_AUTOPLAY
            game.event_log.append("Both kings placed. Game is ready for autoplay.")
            return
        game.setup_turn = game.setup_turn.opposite

    def _can_place_king(self, game: GameState, side: Side) -> bool:
        player = game.player(side)
        has_minimum_pawns = player.mandatory_pawn_count >= game.rules.mandatory_pawns
        spending_complete = player.finished_spending or player.points_remaining == 0
        return has_minimum_pawns and spending_complete

    def _king_in_check_after_placement(self, game: GameState, side: Side, square: str) -> bool:
        board = chess.Board(None)
        for current_side in (Side.WHITE, Side.BLACK):
            player = game.player(current_side)
            color = chess.WHITE if current_side is Side.WHITE else chess.BLACK
            for placed in player.pieces:
                board.set_piece_at(
                    chess.parse_square(placed.square),
                    chess.Piece.from_symbol(placed.type.value if color == chess.WHITE else placed.type.value.lower()),
                )
            if player.king_square:
                board.set_piece_at(
                    chess.parse_square(player.king_square),
                    chess.Piece(chess.KING, color),
                )
        color = chess.WHITE if side is Side.WHITE else chess.BLACK
        king_square = chess.parse_square(square)
        board.set_piece_at(king_square, chess.Piece(chess.KING, color))
        return board.is_attacked_by(not color, king_square)

    def _ensure_square_available(self, game: GameState, square: str) -> None:
        occupied = {piece.square for piece in game.white.pieces + game.black.pieces}
        if game.white.king_square:
            occupied.add(game.white.king_square)
        if game.black.king_square:
            occupied.add(game.black.king_square)
        if square in occupied:
            raise RuleViolation(f"Square {square} is already occupied.")

    def _normalize_square(self, square: str) -> str:
        normalized = square.strip().lower()
        if len(normalized) != 2 or normalized[0] not in FILES or normalized[1] not in "12345678":
            raise RuleViolation(f"Invalid square: {square}")
        return normalized
