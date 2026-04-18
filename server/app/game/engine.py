from __future__ import annotations

import glob
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


class LocalStockfishProvider:
    def __init__(self, config: EngineConfig | None = None) -> None:
        self._config = config or EngineConfig.from_env()

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

        moves: list[ReplayMove] = []

        try:
            engine.configure(
                {
                    "Threads": self._config.threads,
                    "Hash": self._config.hash_mb,
                    **({"Skill Level": self._config.skill_level} if self._config.skill_level is not None else {}),
                }
            )
        except chess.engine.EngineError:
            # Older or different builds may not support every option; replay generation can still continue.
            pass

        try:
            for ply in range(1, self._config.max_plies + 1):
                if board.is_game_over():
                    break

                result = engine.play(
                    board,
                    chess.engine.Limit(time=self._config.movetime_ms / 1000),
                )
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
            engine.quit()

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
            "/opt/homebrew/Cellar/stockfish/*/bin/stockfish",
            "/usr/local/Cellar/stockfish/*/bin/stockfish",
        ):
            globbed.extend(sorted(glob.glob(pattern), reverse=True))
        return globbed

    def _missing_engine_message(self) -> str:
        return (
            "Stockfish was not found. Set STOCKFISH_PATH to a local Stockfish binary, "
            "or install Stockfish in a common location such as /opt/homebrew/bin/stockfish."
        )


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
