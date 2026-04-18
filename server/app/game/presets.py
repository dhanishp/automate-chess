from __future__ import annotations

from app.game.models import ActionRequest, ActionType, CreateSoloGameRequest, PieceType, Side


class PresetNotFoundError(KeyError):
    pass


def build_sample_game_actions(preset_id: str) -> tuple[CreateSoloGameRequest, list[ActionRequest]]:
    if preset_id != "quickstart":
        raise PresetNotFoundError(f"Preset {preset_id} does not exist.")

    actions: list[ActionRequest] = []
    white_pawns = ["a2", "b2", "c2", "d2", "e2", "f2"]
    black_pawns = ["a7", "b7", "c7", "d7", "e7", "f7"]

    for white_square, black_square in zip(white_pawns, black_pawns):
        actions.append(
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.WHITE, piece_type=PieceType.PAWN, square=white_square)
        )
        actions.append(
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=Side.BLACK, piece_type=PieceType.PAWN, square=black_square)
        )

    extra_setup = [
        (Side.WHITE, PieceType.ROOK, "a1"),
        (Side.BLACK, PieceType.ROOK, "a8"),
        (Side.WHITE, PieceType.KNIGHT, "b1"),
        (Side.BLACK, PieceType.KNIGHT, "b8"),
        (Side.WHITE, PieceType.BISHOP, "c1"),
        (Side.BLACK, PieceType.BISHOP, "c8"),
    ]
    for side, piece, square in extra_setup:
        actions.append(
            ActionRequest(action_type=ActionType.PLACE_PIECE, side=side, piece_type=piece, square=square)
        )

    return CreateSoloGameRequest(white_name="White", black_name="Bot"), actions
