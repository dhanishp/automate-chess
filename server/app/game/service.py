from __future__ import annotations

import random
from typing import Dict

from app.game.bot import BotMoveError, EasySetupBot
from app.game.engine import EngineError, EngineProvider, LocalStockfishProvider
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
)
from app.game.presets import build_sample_game_actions
from app.game.rules import AutomateRulesEngine


class GameService:
    def __init__(self, engine_provider: EngineProvider | None = None, rng: random.Random | None = None) -> None:
        self._games: Dict[str, GameState] = {}
        self._rules_engine = AutomateRulesEngine()
        self._engine_provider = engine_provider or LocalStockfishProvider()
        self._rng = rng or random.Random()
        self._setup_bot = EasySetupBot(self._rules_engine, self._rng)

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

        self._games[game.game_id] = game
        return game

    def get_game(self, game_id: str) -> GameState:
        try:
            game = self._games[game_id]
            normalized = self._normalize_setup_turn(game)
            if normalized is not game:
                self._games[game_id] = normalized
            return normalized
        except KeyError as exc:
            raise KeyError(f"Game {game_id} does not exist.") from exc

    def apply_action(self, game_id: str, action: ActionRequest) -> GameState:
        game = self.get_game(game_id)
        working_copy = game.model_copy(deep=True)
        updated = self._rules_engine.apply_action(working_copy, action)
        updated = self._normalize_setup_turn(updated)
        updated = self._advance_bot_turns(updated)
        updated = self._finalize_post_setup_or_failure(updated)

        self._games[game_id] = updated
        return updated

    def _advance_bot_turns(self, game: GameState) -> GameState:
        game = self._normalize_setup_turn(game)
        while game.mode is GameMode.BOT and game.bot_side is not None and game.phase is Phase.SETUP and game.setup_turn is game.bot_side:
            action = self._setup_bot.choose_action(game)
            game.event_log.append(f"{game.bot_side.value} bot selected {action.action_type.value}")
            game = self._rules_engine.apply_action(game, action)
            game = self._normalize_setup_turn(game)
        return self._finalize_post_setup_or_failure(game)

    def _finalize_post_setup(self, game: GameState) -> GameState:
        if game.phase == Phase.READY_FOR_AUTOPLAY:
            game.autoplay = self._engine_provider.generate_autoplay(game)
            game.phase = Phase.AUTOPLAY
            game.result = game.autoplay.result
            game.event_log.append("Autoplay replay generated from the finished setup.")
        return game

    def _finalize_post_setup_or_failure(self, game: GameState) -> GameState:
        try:
            return self._finalize_post_setup(game)
        except EngineError as exc:
            game.phase = Phase.AUTOPLAY
            game.autoplay = AutoplayState(status=AutoplayStatus.FAILED, error=str(exc))
            game.result = None
            game.event_log.append(f"Autoplay replay generation failed: {exc}")
            return game

    def _resolve_human_side(self, choice: HumanSideChoice) -> Side:
        if choice is HumanSideChoice.WHITE:
            return Side.WHITE
        if choice is HumanSideChoice.BLACK:
            return Side.BLACK
        return self._rng.choice([Side.WHITE, Side.BLACK])

    def _normalize_setup_turn(self, game: GameState) -> GameState:
        if game.phase is not Phase.SETUP:
            return game

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


service = GameService()
