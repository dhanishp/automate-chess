from __future__ import annotations

from datetime import datetime, timedelta
import logging
import random
from typing import Dict

from app.game.bot import BotMoveError, EasySetupBot
from app.game.engine import (
    ENGINE_FAILURE_USER_MESSAGE,
    EXPECTED_ENGINE_FAILURES,
    EngineProvider,
    LocalStockfishProvider,
    format_engine_failure,
)
from app.game.models import (
    ActionRequest,
    AutoplayState,
    AutoplayStatus,
    CreateSampleGameRequest,
    CreateSoloGameRequest,
    GameMode,
    GameState,
    HumanSideChoice,
    Phase,
    Side,
    utc_now,
)
from app.game.presets import build_sample_game_actions
from app.game.rules import AutomateRulesEngine


logger = logging.getLogger(__name__)


class BattleRetryError(ValueError):
    pass


class GameService:
    ACTIVE_GAME_IDLE_TIMEOUT = timedelta(minutes=15)
    TERMINAL_GAME_CLEANUP_TIMEOUT = timedelta(minutes=60)

    def __init__(self, engine_provider: EngineProvider | None = None, rng: random.Random | None = None) -> None:
        self._games: Dict[str, GameState] = {}
        self._rules_engine = AutomateRulesEngine()
        self._engine_provider = engine_provider or LocalStockfishProvider()
        self._rng = rng or random.Random()
        self._setup_bot = EasySetupBot(self._rules_engine, self._rng)
        self._total_battles_played = 0

    def create_solo_game(self, request: CreateSoloGameRequest) -> GameState:
        resolved_human_side = self._resolve_human_side(request.human_side)
        game = GameState(mode=request.mode)
        if request.mode is GameMode.BOT:
            game.human_side = resolved_human_side
            game.bot_side = resolved_human_side.opposite
        else:
            game.human_side = None
            game.bot_side = None
        game.event_log.append(
            f"Created solo game: {request.white_name} vs {request.black_name}"
        )
        if game.mode is GameMode.BOT and game.human_side and game.bot_side:
            game.event_log.append(
                f"Solo bot mode: human is {game.human_side.value}, bot is {game.bot_side.value}"
            )
            game = self._normalize_setup_turn(game)
            game = self._advance_bot_turns(game)
        self._touch_game(game)
        self._games[game.game_id] = game
        return game

    def create_sample_game(self, request: CreateSampleGameRequest | None = None) -> GameState:
        request = request or CreateSampleGameRequest()
        preset_request, actions = build_sample_game_actions(request.preset_id)
        resolved_human_side = self._resolve_human_side(request.human_side)
        game = GameState(mode=request.mode)
        if request.mode is GameMode.BOT:
            game.human_side = resolved_human_side
            game.bot_side = resolved_human_side.opposite
        else:
            game.human_side = None
            game.bot_side = None

        game.event_log.append(f"Created sample game: {preset_request.white_name} vs {preset_request.black_name}")
        game.event_log.append(f"Loaded sample preset: {request.preset_id}")

        for action in actions:
            game = self._rules_engine.apply_action(game, action)

        game = self._normalize_setup_turn(game)
        if game.mode is GameMode.BOT and game.human_side and game.bot_side:
            game.event_log.append(
                f"Sample bot mode: human is {game.human_side.value}, bot is {game.bot_side.value}"
            )
            game = self._advance_bot_turns(game)

        self._touch_game(game)
        self._games[game.game_id] = game
        return game

    def get_game(self, game_id: str) -> GameState:
        self._cleanup_games()
        try:
            game = self._games[game_id]
            normalized = self._normalize_setup_turn(game)
            if normalized is not game:
                self._games[game_id] = normalized
            self._touch_game(normalized)
            return normalized
        except KeyError as exc:
            raise KeyError(f"Game {game_id} does not exist.") from exc

    def abandon_game(self, game_id: str) -> None:
        try:
            del self._games[game_id]
        except KeyError as exc:
            raise KeyError(f"Game {game_id} does not exist.") from exc

    def apply_action(self, game_id: str, action: ActionRequest, finalize_autoplay: bool = True) -> GameState:
        game = self.get_game(game_id)
        working_copy = game.model_copy(deep=True)
        updated = self._rules_engine.apply_action(working_copy, action)
        updated = self._normalize_setup_turn(updated)
        updated = self._advance_bot_turns(updated, finalize_autoplay=finalize_autoplay)
        if finalize_autoplay:
            updated = self._finalize_post_setup_or_failure(updated)
        else:
            updated = self._begin_autoplay_if_ready(updated)
        self._touch_game(updated)

        self._games[game_id] = updated
        return updated

    def retry_battle(self, game_id: str, finalize_autoplay: bool = True) -> GameState:
        game = self.get_game(game_id)
        self._validate_retryable_battle(game)

        working_copy = game.model_copy(deep=True)
        working_copy.phase = Phase.READY_FOR_AUTOPLAY
        working_copy.autoplay = AutoplayState(status=AutoplayStatus.NOT_READY)
        working_copy.result = None
        working_copy.event_log.append("Retrying battle simulation from the finished setup.")

        updated = (
            self._finalize_post_setup_or_failure(working_copy)
            if finalize_autoplay
            else self._begin_autoplay_if_ready(working_copy)
        )
        self._touch_game(updated)
        self._games[game_id] = updated
        return updated

    def battle_generation_snapshot(self, game_id: str) -> GameState:
        game = self.get_game(game_id)
        if not self._is_battle_generation_in_progress(game):
            raise BattleRetryError("Battle generation is not pending for this game.")
        return game.model_copy(deep=True)

    def generate_autoplay_for_snapshot(self, game: GameState) -> AutoplayState:
        return self._engine_provider.generate_autoplay(game.model_copy(deep=True))

    def complete_battle_generation(self, game_id: str, autoplay: AutoplayState) -> GameState | None:
        game = self._games.get(game_id)
        if game is None or not self._is_battle_generation_in_progress(game):
            return game

        game.phase = Phase.AUTOPLAY
        game.autoplay = autoplay
        game.result = autoplay.result
        game.event_log.append("Battle simulation generated from the finished setup.")
        if autoplay.status is AutoplayStatus.READY:
            self._total_battles_played += 1
        self._touch_game(game)
        return game

    def fail_battle_generation(self, game_id: str, exc: BaseException) -> GameState | None:
        game = self._games.get(game_id)
        if game is None or not self._is_battle_generation_in_progress(game):
            return game

        error_message = format_engine_failure(exc)
        logger.warning("Battle simulation generation failed (%s): %s", exc.__class__.__name__, error_message)
        game.phase = Phase.AUTOPLAY
        game.autoplay = AutoplayState(status=AutoplayStatus.FAILED, error=ENGINE_FAILURE_USER_MESSAGE)
        game.result = None
        game.event_log.append(f"Battle simulation generation failed: {ENGINE_FAILURE_USER_MESSAGE}")
        self._touch_game(game)
        return game

    def stats(self) -> dict[str, int]:
        self._cleanup_games()
        active_games = sum(1 for game in self._games.values() if self._is_active_game(game))
        return {
            "active_games": active_games,
            "active_players": active_games,
            "total_battles_played": self._total_battles_played,
        }

    def _advance_bot_turns(self, game: GameState, finalize_autoplay: bool = True) -> GameState:
        game = self._normalize_setup_turn(game)
        while game.mode is GameMode.BOT and game.bot_side is not None and game.phase is Phase.SETUP and game.setup_turn is game.bot_side:
            action = self._setup_bot.choose_action(game)
            game.event_log.append(f"{game.bot_side.value} bot selected {action.action_type.value}")
            game = self._rules_engine.apply_action(game, action)
            game = self._normalize_setup_turn(game)
        return self._finalize_post_setup_or_failure(game) if finalize_autoplay else self._begin_autoplay_if_ready(game)

    def _begin_autoplay_if_ready(self, game: GameState) -> GameState:
        if game.phase == Phase.READY_FOR_AUTOPLAY:
            game.phase = Phase.AUTOPLAY
            game.autoplay = AutoplayState(status=AutoplayStatus.RUNNING, error=None)
            game.result = None
            game.event_log.append("Battle simulation generation started.")
        return game

    def _finalize_post_setup(self, game: GameState) -> GameState:
        if game.phase == Phase.READY_FOR_AUTOPLAY:
            game.autoplay = self._engine_provider.generate_autoplay(game)
            game.phase = Phase.AUTOPLAY
            game.result = game.autoplay.result
            game.event_log.append("Battle simulation generated from the finished setup.")
            if game.autoplay.status is AutoplayStatus.READY:
                self._total_battles_played += 1
        return game

    def _finalize_post_setup_or_failure(self, game: GameState) -> GameState:
        try:
            return self._finalize_post_setup(game)
        except EXPECTED_ENGINE_FAILURES as exc:
            error_message = format_engine_failure(exc)
            logger.warning("Battle simulation generation failed (%s): %s", exc.__class__.__name__, error_message)
            game.phase = Phase.AUTOPLAY
            game.autoplay = AutoplayState(status=AutoplayStatus.FAILED, error=ENGINE_FAILURE_USER_MESSAGE)
            game.result = None
            game.event_log.append(f"Battle simulation generation failed: {ENGINE_FAILURE_USER_MESSAGE}")
            return game

    def _validate_retryable_battle(self, game: GameState) -> None:
        if not (game.white.king_square and game.black.king_square):
            raise BattleRetryError("Cannot retry battle before both kings are placed.")
        if game.phase is not Phase.AUTOPLAY or game.autoplay.status is not AutoplayStatus.FAILED:
            raise BattleRetryError("Battle retry is only available after failed battle generation.")

    def _is_battle_generation_in_progress(self, game: GameState) -> bool:
        return game.phase is Phase.AUTOPLAY and game.autoplay.status in {
            AutoplayStatus.PENDING,
            AutoplayStatus.RUNNING,
        }

    def _resolve_human_side(self, choice: HumanSideChoice) -> Side:
        if choice is HumanSideChoice.WHITE:
            return Side.WHITE
        if choice is HumanSideChoice.BLACK:
            return Side.BLACK
        return self._rng.choice([Side.WHITE, Side.BLACK])

    def _normalize_setup_turn(self, game: GameState) -> GameState:
        if game.phase is not Phase.SETUP:
            return game

        self._rules_engine.auto_finish_unspendable_sides(game)
        current_player = game.player(game.setup_turn)
        opposing_side = game.setup_turn.opposite
        opposing_player = game.player(opposing_side)

        current_complete = self._is_side_setup_complete(current_player)
        opposing_complete = self._is_side_setup_complete(opposing_player)

        if current_complete and not opposing_complete:
            if game.setup_turn is not opposing_side:
                game.setup_turn = opposing_side
                game.event_log.append(
                    f"Setup turn advanced to {opposing_side.value} to avoid a completed-side stall."
                )
        return game

    def _is_side_setup_complete(self, player) -> bool:  # noqa: ANN001
        spending_complete = player.finished_spending or player.points_remaining == 0
        return spending_complete and player.king_square is not None

    def _is_active_game(self, game: GameState) -> bool:
        if game.mode is GameMode.MULTIPLAYER:
            return False
        return True

    def _touch_game(self, game: GameState) -> None:
        game.updated_at = utc_now()

    def _cleanup_games(self) -> None:
        now = utc_now()
        expired_game_ids = [
            game_id
            for game_id, game in self._games.items()
            if self._should_cleanup_game(game, now)
        ]
        for game_id in expired_game_ids:
            del self._games[game_id]

    def _should_cleanup_game(self, game: GameState, now: datetime) -> bool:
        idle_for = now - game.updated_at
        if self._is_terminal_game(game):
            return idle_for > self.TERMINAL_GAME_CLEANUP_TIMEOUT
        return idle_for > self.ACTIVE_GAME_IDLE_TIMEOUT

    def _is_terminal_game(self, game: GameState) -> bool:
        if game.phase is Phase.RESULTS:
            return True
        return game.phase is Phase.AUTOPLAY and game.autoplay.status in {
            AutoplayStatus.READY,
            AutoplayStatus.FAILED,
        }


service = GameService()
