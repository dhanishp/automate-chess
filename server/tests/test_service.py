from datetime import timedelta

import chess.engine

from app.game.engine import EngineUnavailableError
from app.game.models import (
    ActionRequest,
    ActionType,
    AutoplayState,
    AutoplayStatus,
    CreateSampleGameRequest,
    CreateSoloGameRequest,
    GameMode,
    HumanSideChoice,
    Phase,
    PieceType,
    PlacedPiece,
    ReplayMove,
    Side,
    utc_now,
)
from app.game.service import GameService
from app.main import compose_stats


def _build_ready_sequence() -> list[ActionRequest]:
    actions: list[ActionRequest] = []
    white_pawns = ["a2", "b2", "c2", "d2", "e2", "f2"]
    black_pawns = ["a7", "b7", "c7", "d7", "e7", "f7"]

    for white_square, black_square in zip(white_pawns, black_pawns):
        actions.append(
            ActionRequest(action_type=ActionType.PLACE_PIECE, side="white", piece_type="P", square=white_square)
        )
        actions.append(
            ActionRequest(action_type=ActionType.PLACE_PIECE, side="black", piece_type="P", square=black_square)
        )

    actions.append(ActionRequest(action_type=ActionType.FINISH_SETUP, side="white"))
    actions.append(ActionRequest(action_type=ActionType.FINISH_SETUP, side="black"))
    actions.append(ActionRequest(action_type=ActionType.PLACE_KING, side="white", square="g1"))
    actions.append(ActionRequest(action_type=ActionType.PLACE_KING, side="black", square="g8"))
    return actions


class FakeEngineProvider:
    def __init__(self) -> None:
        self.calls = 0

    def generate_autoplay(self, game):  # noqa: ANN001
        self.calls += 1
        return AutoplayState(
            status=AutoplayStatus.READY,
            initial_fen="initial-fen",
            moves=[
                ReplayMove(ply=1, uci="g1f3", san="Nf3", fen_after="fen-after-1"),
                ReplayMove(ply=2, uci="g8f6", san="Nf6", fen_after="fen-after-2"),
            ],
            final_fen="final-fen",
            result="1/2-1/2",
        )


class UnavailableEngineProvider:
    def generate_autoplay(self, game):  # noqa: ANN001
        raise EngineUnavailableError("Stockfish missing for tests.")


class TerminatedEngineProvider:
    def generate_autoplay(self, game):  # noqa: ANN001
        raise chess.engine.EngineTerminatedError("engine process died unexpectedly (exit code: -11)")


def test_finished_setup_generates_autoplay_data() -> None:
    engine_provider = FakeEngineProvider()
    service = GameService(engine_provider=engine_provider)
    game = service.create_solo_game(CreateSoloGameRequest())

    for action in _build_ready_sequence():
        game = service.apply_action(game.game_id, action)

    assert engine_provider.calls == 1
    assert game.phase == "autoplay"
    assert game.autoplay.status == "ready"
    assert len(game.autoplay.moves) == 2
    assert game.autoplay.moves[0].san == "Nf3"
    assert game.result == "1/2-1/2"


def test_final_white_king_placement_persists_and_generates_autoplay_once() -> None:
    engine_provider = FakeEngineProvider()
    service = GameService(engine_provider=engine_provider)
    game = service.create_solo_game(CreateSoloGameRequest(mode=GameMode.BOT, human_side=HumanSideChoice.WHITE))
    game.setup_turn = Side.WHITE
    game.white.finished_spending = True
    game.black.finished_spending = True
    game.white.pieces = [PlacedPiece(type=PieceType.PAWN, square=square) for square in ["a2", "b2", "c2", "d2", "e2", "f2"]]
    game.black.pieces = [PlacedPiece(type=PieceType.PAWN, square=square) for square in ["a7", "b7", "c7", "d7", "e7", "f7"]]
    game.black.king_square = "g8"

    updated = service.apply_action(
        game.game_id,
        ActionRequest(action_type=ActionType.PLACE_KING, side=Side.WHITE, square="g1"),
    )

    assert engine_provider.calls == 1
    assert updated.white.king_square == "g1"
    assert updated.black.king_square == "g8"
    assert updated.phase == Phase.AUTOPLAY
    assert updated.autoplay.status == "ready"


def test_stats_count_active_local_and_bot_games() -> None:
    service = GameService(engine_provider=FakeEngineProvider())

    service.create_solo_game(CreateSoloGameRequest(mode=GameMode.LOCAL))
    service.create_solo_game(CreateSoloGameRequest(mode=GameMode.BOT, human_side=HumanSideChoice.WHITE))

    assert service.stats() == {"active_games": 2, "active_players": 2, "total_battles_played": 0}


def test_abandon_game_removes_solo_game_from_stats() -> None:
    service = GameService(engine_provider=FakeEngineProvider())
    game = service.create_solo_game(CreateSoloGameRequest(mode=GameMode.BOT, human_side=HumanSideChoice.WHITE))

    assert service.stats() == {"active_games": 1, "active_players": 1, "total_battles_played": 0}

    service.abandon_game(game.game_id)

    assert service.stats() == {"active_games": 0, "active_players": 0, "total_battles_played": 0}

    try:
        service.get_game(game.game_id)
    except KeyError:
        pass
    else:
        raise AssertionError("Expected abandoned game to be removed.")


def test_stats_count_finished_autoplay_until_abandoned() -> None:
    service = GameService(engine_provider=FakeEngineProvider())
    game = service.create_solo_game(CreateSoloGameRequest())

    for action in _build_ready_sequence():
        game = service.apply_action(game.game_id, action)

    assert game.autoplay.status == "ready"
    assert service.stats() == {"active_games": 1, "active_players": 1, "total_battles_played": 1}

    service.abandon_game(game.game_id)

    assert service.stats() == {"active_games": 0, "active_players": 0, "total_battles_played": 1}


def test_stats_count_failed_autoplay_until_abandoned() -> None:
    service = GameService(engine_provider=UnavailableEngineProvider())
    game = service.create_solo_game(CreateSoloGameRequest())

    for action in _build_ready_sequence():
        game = service.apply_action(game.game_id, action)

    assert game.autoplay.status == "failed"
    assert service.stats() == {"active_games": 1, "active_players": 1, "total_battles_played": 0}

    service.abandon_game(game.game_id)

    assert service.stats() == {"active_games": 0, "active_players": 0, "total_battles_played": 0}


def test_stats_endpoint_composition_includes_rooms_and_solo_games() -> None:
    stats = compose_stats(
        room_stats={"active_games": 2, "players_online": 3, "occupied_players": 4, "total_battles_played": 6},
        solo_stats={"active_games": 5, "active_players": 5, "total_battles_played": 7},
    )

    assert stats == {
        "active_games": 7,
        "active_players": 8,
        "players_online": 3,
        "occupied_players": 9,
        "total_battles_played": 13,
    }


def test_final_black_king_placement_persists_and_generates_autoplay_once() -> None:
    engine_provider = FakeEngineProvider()
    service = GameService(engine_provider=engine_provider)
    game = service.create_solo_game(CreateSoloGameRequest(mode=GameMode.BOT, human_side=HumanSideChoice.BLACK))
    game.setup_turn = Side.BLACK
    game.white.finished_spending = True
    game.black.finished_spending = True
    game.white.pieces = [PlacedPiece(type=PieceType.PAWN, square=square) for square in ["a2", "b2", "c2", "d2", "e2", "f2"]]
    game.black.pieces = [PlacedPiece(type=PieceType.PAWN, square=square) for square in ["a7", "b7", "c7", "d7", "e7", "f7"]]
    game.white.king_square = "g1"

    updated = service.apply_action(
        game.game_id,
        ActionRequest(action_type=ActionType.PLACE_KING, side=Side.BLACK, square="g8"),
    )

    assert engine_provider.calls == 1
    assert updated.white.king_square == "g1"
    assert updated.black.king_square == "g8"
    assert updated.phase == Phase.AUTOPLAY
    assert updated.autoplay.status == "ready"


def test_engine_unavailable_does_not_store_half_completed_autoplay_state() -> None:
    service = GameService(engine_provider=UnavailableEngineProvider())
    game = service.create_solo_game(CreateSoloGameRequest())
    actions = _build_ready_sequence()

    for action in actions[:-1]:
        game = service.apply_action(game.game_id, action)

    game = service.apply_action(game.game_id, actions[-1])

    persisted = service.get_game(game.game_id)
    assert game.phase == "autoplay"
    assert persisted.phase == "autoplay"
    assert persisted.black.king_square == "g8"
    assert persisted.autoplay.status == "failed"
    assert "Stockfish missing" in (persisted.autoplay.error or "")


def test_bot_completed_side_is_skipped_before_human_final_king() -> None:
    service = GameService(engine_provider=FakeEngineProvider())
    game = service.create_solo_game(CreateSoloGameRequest(mode=GameMode.BOT, human_side=HumanSideChoice.WHITE))
    game.setup_turn = Side.BLACK
    game.white.finished_spending = True
    game.black.finished_spending = True
    game.white.pieces = [PlacedPiece(type=PieceType.PAWN, square=square) for square in ["a2", "b2", "c2", "d2", "e2", "f2"]]
    game.black.pieces = [PlacedPiece(type=PieceType.PAWN, square=square) for square in ["a7", "b7", "c7", "d7", "e7", "f7"]]
    game.black.king_square = "g8"

    refreshed = service.get_game(game.game_id)

    assert refreshed.setup_turn == Side.WHITE
    updated = service.apply_action(
        game.game_id,
        ActionRequest(action_type=ActionType.PLACE_KING, side=Side.WHITE, square="g1"),
    )
    assert updated.white.king_square == "g1"
    assert updated.phase == Phase.AUTOPLAY
    assert updated.autoplay.status == AutoplayStatus.READY


def test_bot_final_king_engine_failure_persists_king_and_failed_state() -> None:
    service = GameService(engine_provider=UnavailableEngineProvider())
    game = service.create_solo_game(CreateSoloGameRequest(mode=GameMode.BOT, human_side=HumanSideChoice.BLACK))
    game.setup_turn = Side.BLACK
    game.white.finished_spending = True
    game.black.finished_spending = True
    game.white.pieces = [PlacedPiece(type=PieceType.PAWN, square=square) for square in ["a2", "b2", "c2", "d2", "e2", "f2"]]
    game.black.pieces = [PlacedPiece(type=PieceType.PAWN, square=square) for square in ["a7", "b7", "c7", "d7", "e7", "f7"]]
    game.white.king_square = "g1"

    updated = service.apply_action(
        game.game_id,
        ActionRequest(action_type=ActionType.PLACE_KING, side=Side.BLACK, square="g8"),
    )

    persisted = service.get_game(game.game_id)
    assert updated.black.king_square == "g8"
    assert persisted.black.king_square == "g8"
    assert persisted.phase == Phase.AUTOPLAY
    assert persisted.autoplay.status == AutoplayStatus.FAILED
    assert "Stockfish missing" in (persisted.autoplay.error or "")


def test_bot_final_king_engine_termination_persists_failed_state() -> None:
    service = GameService(engine_provider=TerminatedEngineProvider())
    game = service.create_solo_game(CreateSoloGameRequest(mode=GameMode.BOT, human_side=HumanSideChoice.BLACK))
    game.setup_turn = Side.BLACK
    game.white.finished_spending = True
    game.black.finished_spending = True
    game.white.pieces = [PlacedPiece(type=PieceType.PAWN, square=square) for square in ["a2", "b2", "c2", "d2", "e2", "f2"]]
    game.black.pieces = [PlacedPiece(type=PieceType.PAWN, square=square) for square in ["a7", "b7", "c7", "d7", "e7", "f7"]]
    game.white.king_square = "g1"

    updated = service.apply_action(
        game.game_id,
        ActionRequest(action_type=ActionType.PLACE_KING, side=Side.BLACK, square="g8"),
    )

    persisted = service.get_game(game.game_id)
    assert updated.black.king_square == "g8"
    assert persisted.black.king_square == "g8"
    assert persisted.phase == Phase.AUTOPLAY
    assert persisted.autoplay.status == AutoplayStatus.FAILED
    assert "Stockfish crashed during battle generation" in (persisted.autoplay.error or "")
    assert "exit code: -11" in (persisted.autoplay.error or "")
    assert service.stats() == {"active_games": 1, "active_players": 1, "total_battles_played": 0}


def test_idle_solo_game_expires_from_stats() -> None:
    service = GameService(engine_provider=FakeEngineProvider())
    game = service.create_solo_game(CreateSoloGameRequest(mode=GameMode.BOT, human_side=HumanSideChoice.WHITE))
    game.updated_at = utc_now() - service.ACTIVE_GAME_IDLE_TIMEOUT - timedelta(seconds=1)

    assert service.stats() == {"active_games": 0, "active_players": 0, "total_battles_played": 0}

    try:
        service.get_game(game.game_id)
    except KeyError:
        pass
    else:
        raise AssertionError("Expected idle solo game to be cleaned up.")


def test_create_sample_game_is_mid_setup_sandbox() -> None:
    service = GameService(engine_provider=FakeEngineProvider())

    game = service.create_sample_game()

    assert game.phase == "setup"
    assert game.setup_turn == "white"
    assert game.white.king_square is None
    assert game.black.king_square is None
    assert game.white.finished_spending is False
    assert game.black.finished_spending is False
    assert game.white.mandatory_pawn_count == game.rules.mandatory_pawns
    assert game.black.mandatory_pawn_count == game.rules.mandatory_pawns
    assert game.white.points_remaining > 0
    assert game.black.points_remaining > 0
    assert any("Loaded sample preset: quickstart" in entry for entry in game.event_log)

    continued = service.apply_action(
        game.game_id,
        ActionRequest(action_type=ActionType.PLACE_PIECE, side="white", piece_type="Q", square="d1"),
    )
    assert continued.setup_turn == "black"

    continued = service.apply_action(
        game.game_id,
        ActionRequest(action_type=ActionType.PLACE_PIECE, side="black", piece_type="Q", square="d8"),
    )
    assert continued.setup_turn == "white"


def test_create_sample_game_preserves_bot_mode_when_human_is_white() -> None:
    service = GameService(engine_provider=FakeEngineProvider())

    game = service.create_sample_game(
        CreateSampleGameRequest(mode=GameMode.BOT, human_side=HumanSideChoice.WHITE)
    )

    assert game.mode == "bot"
    assert game.human_side == "white"
    assert game.bot_side == "black"
    assert game.setup_turn == "white"
    assert any("Sample bot mode" in entry for entry in game.event_log)


def test_create_sample_game_triggers_bot_turn_when_human_is_black() -> None:
    service = GameService(engine_provider=FakeEngineProvider())

    game = service.create_sample_game(
        CreateSampleGameRequest(mode=GameMode.BOT, human_side=HumanSideChoice.BLACK)
    )

    assert game.mode == "bot"
    assert game.human_side == "black"
    assert game.bot_side == "white"
    assert game.setup_turn == "black"
    assert len(game.white.pieces) > 9
    assert any("Sample bot mode" in entry for entry in game.event_log)
