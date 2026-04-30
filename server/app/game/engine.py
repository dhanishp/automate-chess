from __future__ import annotations

import glob
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import chess
import chess.engine

from app.game.models import AutoplayState, AutoplayStatus, GameState, PieceType, ReplayMove, Side


class EngineError(RuntimeError):
    pass


class EngineUnavailableError(EngineError):
    pass


EXPECTED_ENGINE_FAILURES = (EngineError, chess.engine.EngineError, TimeoutError, OSError)
logger = logging.getLogger(__name__)


def format_engine_failure(exc: BaseException) -> str:
    if isinstance(exc, chess.engine.EngineTerminatedError):
        return f"Stockfish crashed during battle generation: {exc}"
    if isinstance(exc, TimeoutError):
        return f"Stockfish timed out during battle generation: {exc}"
    message = str(exc)
    return message if message else exc.__class__.__name__


class EngineProvider(Protocol):
    def generate_autoplay(self, game: GameState) -> AutoplayState:
        ...


@dataclass(frozen=True)
class EngineConfig:
    stockfish_path: str | None
    movetime_ms: int = 200
    threads: int = 1
    hash_mb: int = 64
    skill_level: int | None = None
    max_plies: int = 400

    @classmethod
    def from_env(cls) -> "EngineConfig":
        return cls(
            stockfish_path=os.getenv("STOCKFISH_PATH"),
            movetime_ms=int(os.getenv("STOCKFISH_MOVETIME_MS", "200")),
            threads=int(os.getenv("STOCKFISH_THREADS", "1")),
            hash_mb=int(os.getenv("STOCKFISH_HASH_MB", "64")),
            skill_level=int(os.getenv("STOCKFISH_SKILL_LEVEL")) if os.getenv("STOCKFISH_SKILL_LEVEL") else None,
            max_plies=int(os.getenv("STOCKFISH_MAX_PLIES", "400")),
        )


@dataclass(frozen=True)
class StockfishReadiness:
    available: bool
    path: str | None
    message: str


class LocalStockfishProvider:
    def __init__(self, config: EngineConfig | None = None) -> None:
        self._config = config or EngineConfig.from_env()

    def check_readiness(self, timeout_s: float = 2.0) -> StockfishReadiness:
        try:
            stockfish_path = self._resolve_stockfish_path()
        except EngineUnavailableError as exc:
            return StockfishReadiness(available=False, path=None, message=str(exc))

        try:
            engine = chess.engine.SimpleEngine.popen_uci(stockfish_path, timeout=timeout_s)
        except FileNotFoundError:
            return StockfishReadiness(available=False, path=stockfish_path, message=self._missing_engine_message())
        except OSError as exc:
            return StockfishReadiness(
                available=False,
                path=stockfish_path,
                message=f"Unable to launch Stockfish at {stockfish_path}: {exc}",
            )
        except Exception as exc:
            return StockfishReadiness(
                available=False,
                path=stockfish_path,
                message=f"Stockfish was found at {stockfish_path}, but readiness check failed: {exc}",
            )

        try:
            engine.ping()
        except Exception as exc:
            return StockfishReadiness(
                available=False,
                path=stockfish_path,
                message=f"Stockfish was found at {stockfish_path}, but did not respond cleanly: {exc}",
            )
        finally:
            try:
                engine.quit()
            except Exception:
                pass

        return StockfishReadiness(
            available=True,
            path=stockfish_path,
            message="Stockfish is ready.",
        )

    def warmup_search(self, timeout_s: float = 3.0) -> StockfishReadiness:
        try:
            stockfish_path = self._resolve_stockfish_path()
        except EngineUnavailableError as exc:
            return StockfishReadiness(available=False, path=None, message=str(exc))

        try:
            engine = chess.engine.SimpleEngine.popen_uci(stockfish_path, timeout=timeout_s)
        except FileNotFoundError:
            return StockfishReadiness(available=False, path=stockfish_path, message=self._missing_engine_message())
        except OSError as exc:
            return StockfishReadiness(
                available=False,
                path=stockfish_path,
                message=f"Unable to launch Stockfish at {stockfish_path}: {exc}",
            )
        except Exception as exc:
            return StockfishReadiness(
                available=False,
                path=stockfish_path,
                message=f"Stockfish was found at {stockfish_path}, but warmup launch failed: {exc}",
            )

        try:
            board = chess.Board()
            result = engine.play(board, chess.engine.Limit(depth=1, time=0.05))
            if result.move is None:
                return StockfishReadiness(
                    available=False,
                    path=stockfish_path,
                    message="Stockfish launched, but did not return a warmup move.",
                )
        except Exception as exc:
            return StockfishReadiness(
                available=False,
                path=stockfish_path,
                message=f"Stockfish launched, but warmup search failed: {exc}",
            )
        finally:
            try:
                engine.quit()
            except Exception:
                pass

        return StockfishReadiness(
            available=True,
            path=stockfish_path,
            message="Stockfish is warmed and ready for battle simulation.",
        )

    def generate_autoplay(self, game: GameState) -> AutoplayState:
        stockfish_path = self._resolve_stockfish_path()
        board = board_from_game(game)
        initial_fen = board.fen()
        replay = AutoplayState(status=AutoplayStatus.RUNNING, initial_fen=initial_fen)

        try:
            engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
        except FileNotFoundError as exc:
            raise EngineUnavailableError(self._missing_engine_message()) from exc
        except OSError as exc:
            raise EngineUnavailableError(f"Unable to launch Stockfish at {stockfish_path}: {exc}") from exc
        except chess.engine.EngineError as exc:
            raise EngineError(format_engine_failure(exc)) from exc

        moves: list[ReplayMove] = []

        try:
            engine.configure(
                {
                    "Threads": self._config.threads,
                    "Hash": self._config.hash_mb,
                    **({"Skill Level": self._config.skill_level} if self._config.skill_level is not None else {}),
                }
            )
        except chess.engine.EngineTerminatedError as exc:
            raise EngineError(format_engine_failure(exc)) from exc
        except chess.engine.EngineError:
            # Older or different builds may not support every option; replay generation can still continue.
            pass
        except (TimeoutError, OSError) as exc:
            raise EngineError(format_engine_failure(exc)) from exc

        try:
            for ply in range(1, self._config.max_plies + 1):
                if board.is_game_over():
                    break

                try:
                    result = engine.play(
                        board,
                        chess.engine.Limit(time=self._config.movetime_ms / 1000),
                    )
                except EXPECTED_ENGINE_FAILURES as exc:
                    raise EngineError(format_engine_failure(exc)) from exc

                if result.move is None:
                    break

                san = board.san(result.move)
                board.push(result.move)
                moves.append(
                    ReplayMove(
                        ply=ply,
                        uci=result.move.uci(),
                        san=san,
                        fen_after=board.fen(),
                    )
                )
        finally:
            self._quit_engine_safely(engine, "battle generation")

        outcome = board.outcome()
        result_text = outcome.result() if outcome else board.result(claim_draw=True)
        replay.status = AutoplayStatus.READY
        replay.moves = moves
        replay.final_fen = board.fen()
        replay.result = result_text
        return replay

    def _resolve_stockfish_path(self) -> str:
        candidates = []
        if self._config.stockfish_path:
            candidates.append(self._config.stockfish_path)
        candidates.extend(self._autodetected_paths())

        for candidate in candidates:
            if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
                return candidate

        raise EngineUnavailableError(self._missing_engine_message())

    def _autodetected_paths(self) -> list[str]:
        globbed = []
        for pattern in (
            "/opt/homebrew/bin/stockfish",
            "/usr/local/bin/stockfish",
            "/usr/bin/stockfish",
            "/usr/games/stockfish",
            "/opt/homebrew/Cellar/stockfish/*/bin/stockfish",
            "/usr/local/Cellar/stockfish/*/bin/stockfish",
        ):
            globbed.extend(sorted(glob.glob(pattern), reverse=True))
        return globbed

    def _missing_engine_message(self) -> str:
        return (
            "Stockfish was not found. Set STOCKFISH_PATH to a local Stockfish binary, "
            "or install Stockfish in a common location such as /opt/homebrew/bin/stockfish "
            "or /usr/games/stockfish."
        )

    def _quit_engine_safely(self, engine: chess.engine.SimpleEngine, context: str) -> None:
        try:
            engine.quit()
        except Exception as exc:
            logger.warning("Stockfish cleanup failed after %s: %s", context, exc)


def board_from_game(game: GameState) -> chess.Board:
    board = chess.Board(None)

    for side in (Side.WHITE, Side.BLACK):
        player = game.player(side)
        color = chess.WHITE if side is Side.WHITE else chess.BLACK

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

    board.turn = chess.WHITE if game.rules.white_moves_first else chess.BLACK
    board.castling_rights = chess.BB_EMPTY
    board.ep_square = None
    board.halfmove_clock = 0
    board.fullmove_number = 1
    return board
