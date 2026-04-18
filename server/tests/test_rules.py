from app.game.models import ActionRequest, ActionType, GameState, PieceType, Side
from app.game.rules import AutomateRulesEngine, RuleViolation


engine = AutomateRulesEngine()


def build_game() -> GameState:
    return GameState()


def test_white_moves_first() -> None:
    game = build_game()
    assert game.setup_turn == Side.WHITE



def test_white_pawn_can_be_placed_on_second_rank() -> None:
    game = build_game()
    engine.apply_action(
        game,
        ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.WHITE, piece_type=PieceType.PAWN, square="a2"),
    )
    assert game.white.pieces[0].square == "a2"
    assert game.white.points_remaining == 34



def test_white_pawn_cannot_be_placed_on_first_rank() -> None:
    game = build_game()
    try:
        engine.apply_action(
            game,
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.WHITE, piece_type=PieceType.PAWN, square="a1"),
        )
    except RuleViolation as exc:
        assert "cannot be placed" in str(exc)
    else:
        raise AssertionError("Expected pawn placement to fail.")



def test_other_pieces_obey_non_king_rank_rules() -> None:
    game = build_game()
    try:
        engine.apply_action(
            game,
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.WHITE, piece_type=PieceType.ROOK, square="a3"),
        )
    except RuleViolation as exc:
        assert "cannot be placed" in str(exc)
    else:
        raise AssertionError("Expected rook placement to fail.")



def test_turn_order_is_enforced() -> None:
    game = build_game()
    engine.apply_action(
        game,
        ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.WHITE, piece_type=PieceType.PAWN, square="a2"),
    )
    try:
        engine.apply_action(
            game,
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.WHITE, piece_type=PieceType.PAWN, square="b2"),
        )
    except RuleViolation as exc:
        assert "turn" in str(exc).lower()
    else:
        raise AssertionError("Expected turn-order violation.")



def test_finish_setup_allows_king_if_pawn_requirement_met() -> None:
    game = build_game()
    white_squares = ["a2", "b2", "c2", "d2", "e2", "f2"]
    black_squares = ["a7", "b7", "c7", "d7", "e7", "f7"]

    for white_square, black_square in zip(white_squares, black_squares):
        engine.apply_action(
            game,
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.WHITE, piece_type=PieceType.PAWN, square=white_square),
        )
        engine.apply_action(
            game,
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.BLACK, piece_type=PieceType.PAWN, square=black_square),
        )

    engine.apply_action(game, ActionRequest(action_type=ActionType.FINISH_SETUP, side=Side.WHITE))
    engine.apply_action(game, ActionRequest(action_type=ActionType.FINISH_SETUP, side=Side.BLACK))
    engine.apply_action(game, ActionRequest(action_type=ActionType.PLACE_KING, side=Side.WHITE, square="g1"))

    assert game.white.king_square == "g1"



def test_king_cannot_be_placed_before_finish_or_zero_points() -> None:
    game = build_game()
    white_squares = ["a2", "b2", "c2", "d2", "e2", "f2"]
    black_squares = ["a7", "b7", "c7", "d7", "e7", "f7"]

    for white_square, black_square in zip(white_squares, black_squares):
        engine.apply_action(
            game,
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.WHITE, piece_type=PieceType.PAWN, square=white_square),
        )
        engine.apply_action(
            game,
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.BLACK, piece_type=PieceType.PAWN, square=black_square),
        )

    try:
        engine.apply_action(game, ActionRequest(action_type=ActionType.PLACE_KING, side=Side.WHITE, square="g1"))
    except RuleViolation as exc:
        assert "eligible" in str(exc).lower()
    else:
        raise AssertionError("Expected king-placement rejection.")



def test_player_loses_if_king_is_placed_in_check() -> None:
    game = build_game()
    white_pawns = ["a2", "b2", "c2", "d2", "e2", "f2"]
    black_pawns = ["a7", "b7", "c7", "d7", "e7", "f7"]

    for white_square, black_square in zip(white_pawns, black_pawns):
        engine.apply_action(
            game,
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.WHITE, piece_type=PieceType.PAWN, square=white_square),
        )
        engine.apply_action(
            game,
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.BLACK, piece_type=PieceType.PAWN, square=black_square),
        )

    engine.apply_action(
        game,
        ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.WHITE, piece_type=PieceType.ROOK, square="h2"),
    )
    engine.apply_action(
        game,
        ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.BLACK, piece_type=PieceType.ROOK, square="g8"),
    )
    engine.apply_action(game, ActionRequest(action_type=ActionType.FINISH_SETUP, side=Side.WHITE))
    engine.apply_action(game, ActionRequest(action_type=ActionType.FINISH_SETUP, side=Side.BLACK))
    engine.apply_action(game, ActionRequest(action_type=ActionType.PLACE_KING, side=Side.WHITE, square="g1"))

    assert game.result == "black_wins_by_illegal_king_check"



def test_game_becomes_ready_after_both_kings_are_placed() -> None:
    game = build_game()
    white_pawns = ["a2", "b2", "c2", "d2", "e2", "f2"]
    black_pawns = ["a7", "b7", "c7", "d7", "e7", "f7"]

    for white_square, black_square in zip(white_pawns, black_pawns):
        engine.apply_action(
            game,
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.WHITE, piece_type=PieceType.PAWN, square=white_square),
        )
        engine.apply_action(
            game,
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.BLACK, piece_type=PieceType.PAWN, square=black_square),
        )

    engine.apply_action(game, ActionRequest(action_type=ActionType.FINISH_SETUP, side=Side.WHITE))
    engine.apply_action(game, ActionRequest(action_type=ActionType.FINISH_SETUP, side=Side.BLACK))
    engine.apply_action(game, ActionRequest(action_type=ActionType.PLACE_KING, side=Side.WHITE, square="g1"))
    engine.apply_action(game, ActionRequest(action_type=ActionType.PLACE_KING, side=Side.BLACK, square="g8"))

    assert game.phase.value == "ready_for_autoplay"
