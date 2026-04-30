from app import main as app_main
from app.game.engine import EngineConfig, LocalStockfishProvider, StockfishReadiness


class FakeStockfishProvider:
    def __init__(self, readiness: StockfishReadiness) -> None:
        self.readiness = readiness
        self.warmup_calls = 0

    def check_readiness(self) -> StockfishReadiness:
        return self.readiness

    def warmup_search(self) -> StockfishReadiness:
        self.warmup_calls += 1
        return self.readiness


def test_health_remains_lightweight() -> None:
    assert app_main.health() == {"status": "ok"}


def test_ready_reports_ready_stockfish(monkeypatch) -> None:  # noqa: ANN001
    readiness = StockfishReadiness(
        available=True,
        path="/usr/games/stockfish",
        message="Stockfish is ready.",
    )
    monkeypatch.setattr(app_main, "stockfish_provider", FakeStockfishProvider(readiness))

    response = app_main.ready()

    assert response == {
        "status": "ready",
        "app": "ok",
        "stockfish": {
            "available": True,
            "path": "/usr/games/stockfish",
            "message": "Stockfish is ready.",
        },
    }


def test_ready_reports_degraded_stockfish(monkeypatch) -> None:  # noqa: ANN001
    readiness = StockfishReadiness(
        available=False,
        path=None,
        message="Stockfish was not found.",
    )
    monkeypatch.setattr(app_main, "stockfish_provider", FakeStockfishProvider(readiness))

    response = app_main.ready()

    assert response["status"] == "degraded"
    assert response["app"] == "ok"
    assert response["stockfish"] == {
        "available": False,
        "path": None,
        "message": "Stockfish was not found.",
    }


def test_warmup_reports_ready_and_caches_success(monkeypatch) -> None:  # noqa: ANN001
    readiness = StockfishReadiness(
        available=True,
        path="/usr/games/stockfish",
        message="Stockfish is warmed and ready for battle simulation.",
    )
    provider = FakeStockfishProvider(readiness)
    monkeypatch.setattr(app_main, "stockfish_provider", provider)
    monkeypatch.setattr(app_main, "last_stockfish_warmup", None)
    monkeypatch.setattr(app_main, "last_stockfish_warmup_at", None)

    first = app_main.warmup()
    second = app_main.warmup()

    assert first["status"] == "ready"
    assert first["warmup"]["complete"] is True
    assert first["warmup"]["cached"] is False
    assert second["status"] == "ready"
    assert second["warmup"]["complete"] is True
    assert second["warmup"]["cached"] is True
    assert provider.warmup_calls == 1


def test_warmup_reports_degraded_without_caching_failure(monkeypatch) -> None:  # noqa: ANN001
    readiness = StockfishReadiness(
        available=False,
        path=None,
        message="Stockfish warmup failed.",
    )
    provider = FakeStockfishProvider(readiness)
    monkeypatch.setattr(app_main, "stockfish_provider", provider)
    monkeypatch.setattr(app_main, "last_stockfish_warmup", None)
    monkeypatch.setattr(app_main, "last_stockfish_warmup_at", None)

    first = app_main.warmup()
    second = app_main.warmup()

    assert first["status"] == "degraded"
    assert first["warmup"]["complete"] is False
    assert first["warmup"]["cached"] is False
    assert second["status"] == "degraded"
    assert second["warmup"]["cached"] is False
    assert provider.warmup_calls == 2


def test_local_stockfish_readiness_missing_binary_is_degraded(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    provider = LocalStockfishProvider(EngineConfig(stockfish_path=str(tmp_path / "missing-stockfish")))
    monkeypatch.setattr(provider, "_autodetected_paths", lambda: [])

    readiness = provider.check_readiness()

    assert readiness.available is False
    assert readiness.path is None
    assert "Stockfish was not found" in readiness.message


def test_local_stockfish_warmup_missing_binary_is_degraded(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    provider = LocalStockfishProvider(EngineConfig(stockfish_path=str(tmp_path / "missing-stockfish")))
    monkeypatch.setattr(provider, "_autodetected_paths", lambda: [])

    readiness = provider.warmup_search()

    assert readiness.available is False
    assert readiness.path is None
    assert "Stockfish was not found" in readiness.message
