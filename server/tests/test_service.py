from app.game.engine import EngineUnavailableError
from app.game.models import ActionRequest, ActionType, AutoplayState, AutoplayStatus, CreateSoloGameRequest, ReplayMove
from app.game.service import GameService


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


def test_engine_unavailable_does_not_store_half_completed_autoplay_state() -> None:
    service = GameService(engine_provider=UnavailableEngineProvider())
    game = service.create_solo_game(CreateSoloGameRequest())
    actions = _build_ready_sequence()

    for action in actions[:-1]:
        game = service.apply_action(game.game_id, action)

    try:
        service.apply_action(game.game_id, actions[-1])
    except EngineUnavailableError as exc:
        assert "Stockfish missing" in str(exc)
    else:
        raise AssertionError("Expected engine-unavailable error.")

    persisted = service.get_game(game.game_id)
    assert persisted.phase == "setup"
    assert persisted.black.king_square is None
    assert persisted.autoplay.status == "not_ready"
