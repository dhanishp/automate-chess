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


FILE_CHARS = "abcdefgh"
FILES = set(FILE_CHARS)
NON_KING_PIECES: tuple[PieceType, ...] = (
    PieceType.PAWN,
    PieceType.KNIGHT,
    PieceType.BISHOP,
    PieceType.ROOK,
    PieceType.QUEEN,
)


class AutomateRulesEngine:
    def auto_finish_unspendable_sides(self, game: GameState) -> GameState:
        for side in (Side.WHITE, Side.BLACK):
            self._auto_finish_if_no_legal_affordable_buys(game, side)
        return game

    def apply_action(self, game: GameState, action: ActionRequest) -> GameState:
        if game.phase != Phase.SETUP:
            raise RuleViolation("Setup actions are only allowed during the setup phase.")
        if action.side != game.setup_turn:
            raise RuleViolation(f"It is {game.setup_turn.value}'s turn.")

        auto_finished = self._auto_finish_if_no_legal_affordable_buys(game, action.side)

        match action.action_type:
            case ActionType.PLACE_PIECE:
                self._place_piece(game, action.side, action.piece_type, action.square)
                self._auto_finish_if_no_legal_affordable_buys(game, action.side)
            case ActionType.FINISH_SETUP:
                if not auto_finished:
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

        self._ensure_mandatory_pawn_path_remains_viable(
            game=game,
            side=side,
            piece_type=piece_type,
            placed_square=normalized_square,
            cost=cost,
        )

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

    def _auto_finish_if_no_legal_affordable_buys(self, game: GameState, side: Side) -> bool:
        player = game.player(side)
        if game.phase is not Phase.SETUP:
            return False
        if player.finished_spending or player.king_square is not None:
            return False
        if player.mandatory_pawn_count < game.rules.mandatory_pawns:
            return False
        if self.has_legal_affordable_non_king_placement(game, side):
            return False

        player.finished_spending = True
        game.event_log.append(
            f"{side.value} setup locked automatically; no legal affordable buys remain with "
            f"{player.points_remaining} points remaining"
        )
        return True

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
            game.event_log.append("Both kings placed. Battle simulation is ready.")
            return
        next_side = game.setup_turn.opposite
        if self._side_setup_complete(game, next_side) and not self._side_setup_complete(game, next_side.opposite):
            game.setup_turn = next_side.opposite
            return
        game.setup_turn = next_side

    def _can_place_king(self, game: GameState, side: Side) -> bool:
        player = game.player(side)
        has_minimum_pawns = player.mandatory_pawn_count >= game.rules.mandatory_pawns
        spending_complete = player.finished_spending or player.points_remaining == 0
        return has_minimum_pawns and spending_complete

    def has_legal_affordable_non_king_placement(self, game: GameState, side: Side) -> bool:
        if game.phase is not Phase.SETUP:
            return False

        player = game.player(side)
        if player.finished_spending:
            return False

        occupied = self._occupied_squares(game)
        for piece_type in NON_KING_PIECES:
            cost = game.rules.costs[piece_type]
            if cost > player.points_remaining:
                continue

            ranks = game.rules.pawn_ranks[side] if piece_type is PieceType.PAWN else game.rules.non_king_ranks[side]
            for square in self._squares_for_ranks(ranks):
                if square in occupied:
                    continue

                try:
                    self._ensure_mandatory_pawn_path_remains_viable(
                        game=game,
                        side=side,
                        piece_type=piece_type,
                        placed_square=square,
                        cost=cost,
                    )
                except RuleViolation:
                    continue
                return True

        return False

    def _side_setup_complete(self, game: GameState, side: Side) -> bool:
        player = game.player(side)
        spending_complete = player.finished_spending or player.points_remaining == 0
        return spending_complete and player.king_square is not None

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
        occupied = self._occupied_squares(game)
        if square in occupied:
            raise RuleViolation(f"Square {square} is already occupied.")

    def _ensure_mandatory_pawn_path_remains_viable(
        self,
        game: GameState,
        side: Side,
        piece_type: PieceType,
        placed_square: str,
        cost: int,
    ) -> None:
        player = game.player(side)
        pawn_cost = game.rules.costs[PieceType.PAWN]
        pawn_count_after_move = player.mandatory_pawn_count + (1 if piece_type == PieceType.PAWN else 0)
        remaining_required_pawns = max(game.rules.mandatory_pawns - pawn_count_after_move, 0)
        remaining_points_after_move = player.points_remaining - cost

        if remaining_points_after_move < remaining_required_pawns * pawn_cost:
            raise RuleViolation(
                "This move would leave too few points or legal pawn squares to satisfy the mandatory pawn requirement."
            )

        occupied_after_move = self._occupied_squares(game)
        occupied_after_move.add(placed_square)
        remaining_legal_pawn_squares = len(self._pawn_squares_for_side(side, game) - occupied_after_move)
        if remaining_legal_pawn_squares < remaining_required_pawns:
            raise RuleViolation(
                "This move would leave too few points or legal pawn squares to satisfy the mandatory pawn requirement."
            )

    def _occupied_squares(self, game: GameState) -> set[str]:
        occupied = {piece.square for piece in game.white.pieces + game.black.pieces}
        if game.white.king_square:
            occupied.add(game.white.king_square)
        if game.black.king_square:
            occupied.add(game.black.king_square)
        return occupied

    def _pawn_squares_for_side(self, side: Side, game: GameState) -> set[str]:
        return {
            f"{file_char}{rank}"
            for file_char in FILE_CHARS
            for rank in game.rules.pawn_ranks[side]
        }

    def _squares_for_ranks(self, ranks: set[int]) -> list[str]:
        return [f"{file_char}{rank}" for rank in sorted(ranks) for file_char in FILE_CHARS]

    def _normalize_square(self, square: str) -> str:
        normalized = square.strip().lower()
        if len(normalized) != 2 or normalized[0] not in FILES or normalized[1] not in "12345678":
            raise RuleViolation(f"Invalid square: {square}")
        return normalized
