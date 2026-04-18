from __future__ import annotations

import random
from dataclasses import dataclass

from app.game.models import ActionRequest, ActionType, GameState, PieceType, Side
from app.game.rules import AutomateRulesEngine, RuleViolation

FILES = "abcdefgh"
NON_KING_PIECES: tuple[PieceType, ...] = (
    PieceType.PAWN,
    PieceType.KNIGHT,
    PieceType.BISHOP,
    PieceType.ROOK,
    PieceType.QUEEN,
)


class BotMoveError(RuntimeError):
    pass


@dataclass(frozen=True)
class WeightedAction:
    action: ActionRequest
    weight: float


def occupied_squares(game: GameState) -> set[str]:
    occupied = {piece.square for piece in game.white.pieces + game.black.pieces}
    if game.white.king_square:
        occupied.add(game.white.king_square)
    if game.black.king_square:
        occupied.add(game.black.king_square)
    return occupied


def squares_for_ranks(ranks: set[int]) -> list[str]:
    return [f"{file_char}{rank}" for rank in sorted(ranks) for file_char in FILES]


class EasySetupBot:
    def __init__(self, rules_engine: AutomateRulesEngine, rng: random.Random | None = None) -> None:
        self._rules_engine = rules_engine
        self._rng = rng or random.Random()

    def choose_action(self, game: GameState) -> ActionRequest:
        if game.bot_side is None or game.mode.value != "bot":
            raise BotMoveError("Bot action requested for a non-bot game.")
        if game.phase.value != "setup":
            raise BotMoveError("Bot setup actions are only available during setup.")
        if game.setup_turn != game.bot_side:
            raise BotMoveError("It is not the bot's turn.")

        candidates = self.enumerate_legal_actions(game, game.bot_side)
        if not candidates:
            raise BotMoveError(f"No legal setup actions available for bot side {game.bot_side.value}.")

        actions = [candidate.action for candidate in candidates]
        weights = [candidate.weight for candidate in candidates]
        return self._rng.choices(actions, weights=weights, k=1)[0]

    def enumerate_legal_actions(self, game: GameState, side: Side) -> list[WeightedAction]:
        if game.phase.value != "setup" or game.setup_turn != side:
            return []

        player = game.player(side)
        occupied = occupied_squares(game)
        candidates: list[WeightedAction] = []
        mandatory_pawns_remaining = max(game.rules.mandatory_pawns - player.mandatory_pawn_count, 0)

        if not player.finished_spending:
            for piece_type in NON_KING_PIECES:
                cost = game.rules.costs[piece_type]
                if cost > player.points_remaining:
                    continue

                ranks = game.rules.pawn_ranks[side] if piece_type is PieceType.PAWN else game.rules.non_king_ranks[side]
                for square in squares_for_ranks(ranks):
                    if square in occupied:
                        continue
                    action = ActionRequest(
                        action_type=ActionType.PLACE_PIECE,
                        side=side,
                        piece_type=piece_type,
                        square=square,
                    )
                    if self._is_legal(game, action):
                        candidates.append(
                            WeightedAction(
                                action=action,
                                weight=self._placement_weight(game, side, piece_type, square, mandatory_pawns_remaining),
                            )
                        )

            if player.mandatory_pawn_count >= game.rules.mandatory_pawns:
                finish_action = ActionRequest(action_type=ActionType.FINISH_SETUP, side=side)
                if self._is_legal(game, finish_action):
                    candidates.append(
                        WeightedAction(
                            action=finish_action,
                            weight=self._finish_weight(player.points_remaining, len(player.pieces)),
                        )
                    )

        for square in squares_for_ranks(game.rules.king_ranks[side]):
            if square in occupied:
                continue
            king_action = ActionRequest(action_type=ActionType.PLACE_KING, side=side, square=square)
            if self._is_legal(game, king_action):
                candidates.append(
                    WeightedAction(
                        action=king_action,
                        weight=self._king_weight(square),
                    )
                )

        return candidates

    def _is_legal(self, game: GameState, action: ActionRequest) -> bool:
        try:
            self._rules_engine.apply_action(game.model_copy(deep=True), action)
        except RuleViolation:
            return False
        return True

    def _placement_weight(
        self,
        game: GameState,
        side: Side,
        piece_type: PieceType,
        square: str,
        mandatory_pawns_remaining: int,
    ) -> float:
        base_weight = {
            PieceType.PAWN: 4.4,
            PieceType.KNIGHT: 2.9,
            PieceType.BISHOP: 2.8,
            PieceType.ROOK: 2.0,
            PieceType.QUEEN: 1.4,
        }[piece_type]

        if mandatory_pawns_remaining > 0:
            if piece_type is PieceType.PAWN:
                base_weight *= 3.3
            else:
                base_weight *= 0.16
        elif piece_type is PieceType.PAWN:
            base_weight *= 0.45

        file_index = FILES.index(square[0])
        rank = int(square[1])
        file_bonus = 4 - abs(3.5 - file_index)
        target_rank = 2.5 if side is Side.WHITE else 6.5
        rank_bonus = 3 - abs(target_rank - rank)

        return max(0.1, base_weight + (file_bonus * 0.35) + (rank_bonus * 0.18))

    def _finish_weight(self, points_remaining: int, pieces_placed: int) -> float:
        if points_remaining <= 2:
            return 7.5
        if pieces_placed >= 8:
            return 4.2
        return 1.8

    def _king_weight(self, square: str) -> float:
        preferred_files = {
            "e": 4.0,
            "f": 3.5,
            "g": 3.2,
            "d": 3.0,
            "c": 2.2,
            "b": 1.2,
            "h": 1.0,
            "a": 0.8,
        }
        return preferred_files.get(square[0], 1.0)
