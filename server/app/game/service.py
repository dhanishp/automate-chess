from __future__ import annotations

from typing import Dict

from app.game.engine import EngineProvider, LocalStockfishProvider
from app.game.models import ActionRequest, CreateSoloGameRequest, GameState, Phase
from app.game.presets import build_sample_game_actions
from app.game.rules import AutomateRulesEngine


class GameService:
    def __init__(self, engine_provider: EngineProvider | None = None) -> None:
        self._games: Dict[str, GameState] = {}
        self._rules_engine = AutomateRulesEngine()
        self._engine_provider = engine_provider or LocalStockfishProvider()

    def create_solo_game(self, request: CreateSoloGameRequest) -> GameState:
        game = GameState()
        game.event_log.append(
            f"Created solo game: {request.white_name} vs {request.black_name}"
        )
        self._games[game.game_id] = game
        return game

    def create_sample_game(self, preset_id: str = "quickstart") -> GameState:
        request, actions = build_sample_game_actions(preset_id)
        game = GameState()
        game.event_log.append(f"Created sample game: {request.white_name} vs {request.black_name}")
        game.event_log.append(f"Loaded sample preset: {preset_id}")

        for action in actions:
            game = self._rules_engine.apply_action(game, action)

        self._games[game.game_id] = game
        return game

    def get_game(self, game_id: str) -> GameState:
        try:
            return self._games[game_id]
        except KeyError as exc:
            raise KeyError(f"Game {game_id} does not exist.") from exc

    def apply_action(self, game_id: str, action: ActionRequest) -> GameState:
        game = self.get_game(game_id)
        working_copy = game.model_copy(deep=True)
        updated = self._rules_engine.apply_action(working_copy, action)

        if updated.phase == Phase.READY_FOR_AUTOPLAY:
            updated.autoplay = self._engine_provider.generate_autoplay(updated)
            updated.phase = Phase.AUTOPLAY
            updated.result = updated.autoplay.result
            updated.event_log.append("Autoplay replay generated from the finished setup.")

        self._games[game_id] = updated
        return updated


service = GameService()
