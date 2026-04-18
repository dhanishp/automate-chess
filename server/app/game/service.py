from __future__ import annotations

from typing import Dict

from app.game.engine import EngineProvider, LocalStockfishProvider
from app.game.models import ActionRequest, CreateSoloGameRequest, GameState, Phase
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
