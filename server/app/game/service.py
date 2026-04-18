from __future__ import annotations

from typing import Dict

from app.game.models import ActionRequest, ApiResponse, CreateSoloGameRequest, GameState
from app.game.rules import AutomateRulesEngine


class GameService:
    def __init__(self) -> None:
        self._games: Dict[str, GameState] = {}
        self._rules_engine = AutomateRulesEngine()

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
        updated = self._rules_engine.apply_action(game, action)
        self._games[game_id] = updated
        return updated


service = GameService()
