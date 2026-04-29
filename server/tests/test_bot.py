import random

from app.game.bot import EasySetupBot
from app.game.models import (
    ActionRequest,
    ActionType,
    AutoplayState,
    AutoplayStatus,
    CreateSoloGameRequest,
    GameMode,
    GameState,
    HumanSideChoice,
    PlacedPiece,
    ReplayMove,
    Side,
)
from app.game.rules import AutomateRulesEngine, RuleViolation
from app.game.service import GameService


class FakeEngineProvider:
    def generate_autoplay(self, game):  # noqa: ANN001
        return AutoplayState(
            status=AutoplayStatus.READY,
            initial_fen="initial-fen",
            moves=[ReplayMove(ply=1, uci="g1f3", san="Nf3", fen_after="fen-after-1")],
            final_fen="final-fen",
            result="1-0",
        )


def test_easy_bot_generates_legal_action() -> None:
    rules = AutomateRulesEngine()
    bot = EasySetupBot(rules, random.Random(0))
    game = GameState(mode=GameMode.BOT, human_side=Side.BLACK, bot_side=Side.WHITE)

    action = bot.choose_action(game)

    updated = rules.apply_action(game.model_copy(deep=True), action)
    assert updated.setup_turn == Side.BLACK


def test_easy_bot_does_not_finish_while_legal_piece_placements_remain() -> None:
    rules = AutomateRulesEngine()
    bot = EasySetupBot(rules, random.Random(0))
    game = GameState(mode=GameMode.BOT, human_side=Side.WHITE, bot_side=Side.BLACK, setup_turn=Side.BLACK)

    for square in ("a7", "b7", "c7", "d7", "e7", "f7"):
        game.black.pieces.append(PlacedPiece(type="P", square=square))
    game.black.points_remaining = 4

    candidates = bot.enumerate_legal_actions(game, Side.BLACK)

    assert candidates
    assert all(candidate.action.action_type is not ActionType.FINISH_SETUP for candidate in candidates)


def test_easy_bot_respects_setup_constraints_over_multiple_turns() -> None:
    rules = AutomateRulesEngine()
    bot = EasySetupBot(rules, random.Random(1))
    game = GameState(mode=GameMode.BOT, human_side=Side.BLACK, bot_side=Side.WHITE)

    for _ in range(4):
        action = bot.choose_action(game)
        assert action.side == Side.WHITE
        assert action.action_type in {ActionType.PLACE_PIECE, ActionType.FINISH_SETUP, ActionType.PLACE_KING}

        updated = rules.apply_action(game.model_copy(deep=True), action)
        bot_player = updated.white
        assert bot_player.points_remaining >= 0
        assert bot_player.mandatory_pawn_count >= 0
        game = updated
        game.setup_turn = Side.WHITE


def test_human_vs_bot_game_starts_with_bot_progress_when_bot_is_white() -> None:
    service = GameService(engine_provider=FakeEngineProvider(), rng=random.Random(2))

    game = service.create_solo_game(
        CreateSoloGameRequest(mode=GameMode.BOT, human_side=HumanSideChoice.BLACK)
    )

    assert game.mode == GameMode.BOT
    assert game.human_side == Side.BLACK
    assert game.bot_side == Side.WHITE
    assert game.setup_turn == Side.BLACK
    assert len(game.white.pieces) == 1


def test_human_vs_bot_game_can_progress_into_autoplay() -> None:
    rng = random.Random(3)
    service = GameService(engine_provider=FakeEngineProvider(), rng=rng)
    helper_bot = EasySetupBot(AutomateRulesEngine(), random.Random(7))
    game = service.create_solo_game(
        CreateSoloGameRequest(mode=GameMode.BOT, human_side=HumanSideChoice.WHITE)
    )

    for _ in range(80):
        if game.phase == "autoplay":
            break

        assert game.phase == "setup"
        assert game.human_side == Side.WHITE
        assert game.setup_turn == Side.WHITE

        candidates = helper_bot.enumerate_legal_actions(game, Side.WHITE)
        assert candidates, "Human-controlled side should always have a legal setup action."
        action = _choose_progressive_human_action(service, helper_bot, game, candidates)
        game = service.apply_action(game.game_id, action)
    else:
        raise AssertionError("Expected human-vs-bot setup to reach autoplay.")

    assert game.phase == "autoplay"
    assert game.autoplay.status == "ready"
    assert game.result == "1-0"


def test_service_repairs_completed_side_turn_if_game_state_stalls() -> None:
    service = GameService(engine_provider=FakeEngineProvider(), rng=random.Random(11))
    game = GameState(mode=GameMode.BOT, human_side=Side.WHITE, bot_side=Side.BLACK)

    for square in ("a2", "b2", "c2", "d2", "e2", "f2"):
        game.white.pieces.append(PlacedPiece(type="P", square=square))
    game.white.finished_spending = True
    game.white.king_square = "g1"

    game.black.pieces.append(PlacedPiece(type="P", square="a7"))
    game.setup_turn = Side.WHITE
    service._games[game.game_id] = game

    repaired = service.get_game(game.game_id)

    assert repaired.setup_turn == Side.BLACK
    assert any("avoid a completed-side stall" in entry for entry in repaired.event_log)


def _choose_progressive_human_action(
    service: GameService,
    helper_bot: EasySetupBot,
    game: GameState,
    candidates,
) -> ActionRequest:
    for candidate in candidates:
        simulated = service._rules_engine.apply_action(game.model_copy(deep=True), candidate.action)
        if simulated.phase != "setup" or simulated.setup_turn != simulated.bot_side:
            return candidate.action

        bot_candidates = helper_bot.enumerate_legal_actions(simulated, simulated.bot_side)
        if bot_candidates:
            return candidate.action

    return candidates[0].action
