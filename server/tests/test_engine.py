import chess.engine
import pytest

from app.game.engine import ENGINE_FAILURE_USER_MESSAGE, EngineConfig, EngineError, LocalStockfishProvider
from app.game.models import GameState, PieceType, PlacedPiece


def _ready_game() -> GameState:
    game = GameState()
    game.white.finished_spending = True
    game.black.finished_spending = True
    game.white.pieces = [PlacedPiece(type=PieceType.PAWN, square="a2")]
    game.black.pieces = [PlacedPiece(type=PieceType.PAWN, square="a7")]
    game.white.king_square = "g1"
    game.black.king_square = "g8"
    return game


def test_generate_autoplay_preserves_play_failure_when_quit_also_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    class CrashingEngine:
        quit_called = False

        def configure(self, options):  # noqa: ANN001
            return None

        def play(self, board, limit):  # noqa: ANN001
            raise chess.engine.EngineTerminatedError("engine process died unexpectedly (exit code: -11)")

        def quit(self) -> None:
            self.quit_called = True
            raise chess.engine.EngineTerminatedError("engine event loop dead")

    engine = CrashingEngine()
    provider = LocalStockfishProvider(EngineConfig(stockfish_path="/fake/stockfish", max_plies=1, max_attempts=1))
    monkeypatch.setattr(provider, "_resolve_stockfish_path", lambda: "/fake/stockfish")
    monkeypatch.setattr(chess.engine.SimpleEngine, "popen_uci", lambda path: engine)

    with pytest.raises(EngineError) as exc_info:
        provider.generate_autoplay(_ready_game())

    assert engine.quit_called is True
    assert str(exc_info.value) == ENGINE_FAILURE_USER_MESSAGE
    assert isinstance(exc_info.value.__cause__, EngineError)
    assert "exit code: -11" in str(exc_info.value.__cause__)
    assert "event loop dead" not in str(exc_info.value)


def test_generate_autoplay_retries_fresh_engine_after_termination(monkeypatch: pytest.MonkeyPatch) -> None:
    class CrashingEngine:
        quit_called = False

        def configure(self, options):  # noqa: ANN001
            return None

        def play(self, board, limit):  # noqa: ANN001
            raise chess.engine.EngineTerminatedError("engine process died unexpectedly (exit code: -11)")

        def quit(self) -> None:
            self.quit_called = True

    class WorkingEngine:
        quit_called = False

        def configure(self, options):  # noqa: ANN001
            return None

        def play(self, board, limit):  # noqa: ANN001
            return chess.engine.PlayResult(chess.Move.from_uci("a2a3"), None)

        def quit(self) -> None:
            self.quit_called = True

    engines = [CrashingEngine(), WorkingEngine()]
    provider = LocalStockfishProvider(EngineConfig(stockfish_path="/fake/stockfish", max_plies=1, max_attempts=3))
    monkeypatch.setattr(provider, "_resolve_stockfish_path", lambda: "/fake/stockfish")
    monkeypatch.setattr(chess.engine.SimpleEngine, "popen_uci", lambda path: engines.pop(0))

    replay = provider.generate_autoplay(_ready_game())

    assert replay.status == "ready"
    assert replay.moves[0].uci == "a2a3"
    assert engines == []


def test_generate_autoplay_fails_after_bounded_attempts(monkeypatch: pytest.MonkeyPatch) -> None:
    class CrashingEngine:
        def configure(self, options):  # noqa: ANN001
            return None

        def play(self, board, limit):  # noqa: ANN001
            raise chess.engine.EngineTerminatedError("engine process died unexpectedly (exit code: -11)")

        def quit(self) -> None:
            raise chess.engine.EngineTerminatedError("engine event loop dead")

    attempts = 0

    def popen(_path):  # noqa: ANN001
        nonlocal attempts
        attempts += 1
        return CrashingEngine()

    provider = LocalStockfishProvider(EngineConfig(stockfish_path="/fake/stockfish", max_plies=1, max_attempts=3))
    monkeypatch.setattr(provider, "_resolve_stockfish_path", lambda: "/fake/stockfish")
    monkeypatch.setattr(chess.engine.SimpleEngine, "popen_uci", popen)

    with pytest.raises(EngineError) as exc_info:
        provider.generate_autoplay(_ready_game())

    assert attempts == 3
    assert str(exc_info.value) == ENGINE_FAILURE_USER_MESSAGE
