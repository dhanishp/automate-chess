from app.game.engine import EngineUnavailableError
from app.game.models import (
    ActionRequest,
    ActionType,
    AutoplayState,
    AutoplayStatus,
    CreateRoomRequest,
    ReplayMove,
    RoomActionRequest,
    JoinRoomRequest,
    LeaveRoomRequest,
)
from app.game.rooms import RoomAccessError, RoomJoinError, RoomNotFoundError, RoomNotReadyError, RoomService


def _build_ready_sequence() -> list[ActionRequest]:
    actions: list[ActionRequest] = []
    white_pawns = ["a2", "b2", "c2", "d2", "e2", "f2"]
    black_pawns = ["a7", "b7", "c7", "d7", "e7", "f7"]

    for white_square, black_square in zip(white_pawns, black_pawns):
        actions.append(
            ActionRequest(action_type=ActionType.PLACE_PIECE, side="white", piece_type="P", square=white_square)
        )
        actions.append(
            ActionRequest(action_type=ActionType.PLACE_PIECE, side="black", piece_type="P", square=black_square)
        )

    actions.append(ActionRequest(action_type=ActionType.FINISH_SETUP, side="white"))
    actions.append(ActionRequest(action_type=ActionType.FINISH_SETUP, side="black"))
    actions.append(ActionRequest(action_type=ActionType.PLACE_KING, side="white", square="g1"))
    actions.append(ActionRequest(action_type=ActionType.PLACE_KING, side="black", square="g8"))
    return actions


class FakeEngineProvider:
    def generate_autoplay(self, game):  # noqa: ANN001
        return AutoplayState(
            status=AutoplayStatus.READY,
            initial_fen="initial-fen",
            moves=[ReplayMove(ply=1, uci="g1f3", san="Nf3", fen_after="fen-after-1")],
            final_fen="final-fen",
            result="1-0",
        )


class UnavailableEngineProvider:
    def generate_autoplay(self, game):  # noqa: ANN001
        raise EngineUnavailableError("Stockfish missing for multiplayer test.")


def _assert_room_snapshot_hides_player_tokens(room) -> None:  # noqa: ANN001
    payload = room.model_dump(mode="json")
    assert "player_token" not in payload["white_player"]
    if payload["black_player"] is not None:
        assert "player_token" not in payload["black_player"]


def test_room_creation_assigns_white_and_waiting_status() -> None:
    service = RoomService(engine_provider=FakeEngineProvider())

    response = service.create_room(CreateRoomRequest())

    assert response.player_side == "white"
    assert response.room.room_code
    assert response.room.version == 1
    assert response.room.status == "waiting"
    assert response.player_token
    assert response.room.white_player.side == "white"
    assert response.room.black_player is None
    _assert_room_snapshot_hides_player_tokens(response.room)


def test_room_join_assigns_black_and_activates_room() -> None:
    service = RoomService(engine_provider=FakeEngineProvider())
    created = service.create_room(CreateRoomRequest())
    created_version = created.room.version

    joined = service.join_room(JoinRoomRequest(room_code=created.room.room_code))

    assert joined.player_side == "black"
    assert joined.room.black_player is not None
    assert joined.room.status == "active"
    assert joined.room.version == created_version + 1
    _assert_room_snapshot_hides_player_tokens(joined.room)


def test_room_snapshots_only_include_current_player_token_at_top_level() -> None:
    service = RoomService(engine_provider=FakeEngineProvider())
    created = service.create_room(CreateRoomRequest())
    joined = service.join_room(JoinRoomRequest(room_code=created.room.room_code))

    white_view = service.get_room(created.room.room_code, created.player_token)
    black_view = service.get_room(created.room.room_code, joined.player_token)

    assert white_view.player_token == created.player_token
    assert black_view.player_token == joined.player_token
    assert white_view.player_token != black_view.player_token
    _assert_room_snapshot_hides_player_tokens(white_view.room)
    _assert_room_snapshot_hides_player_tokens(black_view.room)


def test_room_join_rejects_full_room() -> None:
    service = RoomService(engine_provider=FakeEngineProvider())
    created = service.create_room(CreateRoomRequest())
    service.join_room(JoinRoomRequest(room_code=created.room.room_code))

    try:
        service.join_room(JoinRoomRequest(room_code=created.room.room_code))
    except RoomJoinError as exc:
        assert "already full" in str(exc)
    else:
        raise AssertionError("Expected full-room join to fail.")


def test_multiplayer_action_only_allowed_for_matching_side_and_turn() -> None:
    service = RoomService(engine_provider=FakeEngineProvider())
    created = service.create_room(CreateRoomRequest())
    joined = service.join_room(JoinRoomRequest(room_code=created.room.room_code))

    try:
        service.apply_action(
            created.room.room_code,
            RoomActionRequest(
                player_token=joined.player_token,
                action=ActionRequest(action_type=ActionType.PLACE_PIECE, side="black", piece_type="P", square="a7"),
            ),
        )
    except ValueError as exc:
        assert "turn" in str(exc).lower()
    else:
        raise AssertionError("Expected out-of-turn action to fail.")

    try:
        service.apply_action(
            created.room.room_code,
            RoomActionRequest(
                player_token=created.player_token,
                action=ActionRequest(action_type=ActionType.PLACE_PIECE, side="black", piece_type="P", square="a7"),
            ),
        )
    except RoomAccessError as exc:
        assert "assigned side" in str(exc).lower()
    else:
        raise AssertionError("Expected wrong-side action to fail.")


def test_multiplayer_action_rejected_before_opponent_joins() -> None:
    service = RoomService(engine_provider=FakeEngineProvider())
    created = service.create_room(CreateRoomRequest())

    try:
        service.apply_action(
            created.room.room_code,
            RoomActionRequest(
                player_token=created.player_token,
                action=ActionRequest(action_type=ActionType.PLACE_PIECE, side="white", piece_type="P", square="a2"),
            ),
        )
    except RoomNotReadyError as exc:
        assert "opponent" in str(exc).lower()
    else:
        raise AssertionError("Expected pre-join action to fail.")


def test_multiplayer_room_progresses_into_autoplay() -> None:
    service = RoomService(engine_provider=FakeEngineProvider())
    created = service.create_room(CreateRoomRequest())
    joined = service.join_room(JoinRoomRequest(room_code=created.room.room_code))

    for action in _build_ready_sequence():
        token = created.player_token if action.side == "white" else joined.player_token
        room = service.apply_action(
            created.room.room_code,
            RoomActionRequest(player_token=token, action=action),
        )

    assert room.status == "complete"
    assert room.game.phase == "autoplay"
    assert room.game.autoplay.status == "ready"
    assert room.game.result == "1-0"


def test_room_can_enter_running_autoplay_state_before_generation_finishes() -> None:
    service = RoomService(engine_provider=FakeEngineProvider())
    created = service.create_room(CreateRoomRequest())
    joined = service.join_room(JoinRoomRequest(room_code=created.room.room_code))

    for action in _build_ready_sequence()[:-1]:
        token = created.player_token if action.side == "white" else joined.player_token
        service.apply_action(
            created.room.room_code,
            RoomActionRequest(player_token=token, action=action),
        )

    room = service.apply_action(
        created.room.room_code,
        RoomActionRequest(player_token=joined.player_token, action=_build_ready_sequence()[-1]),
        finalize_autoplay=False,
    )

    assert room.game.phase == "ready_for_autoplay"
    assert room.game.autoplay.status == "pending"

    room = service.begin_autoplay(created.room.room_code)
    assert room.game.phase == "autoplay"
    assert room.game.autoplay.status == "running"

    room = service.finalize_autoplay(created.room.room_code)
    assert room.game.autoplay.status == "ready"


def test_multiplayer_autoplay_failure_is_shared_failed_state() -> None:
    service = RoomService(engine_provider=UnavailableEngineProvider())
    created = service.create_room(CreateRoomRequest())
    joined = service.join_room(JoinRoomRequest(room_code=created.room.room_code))

    for action in _build_ready_sequence()[:-1]:
        token = created.player_token if action.side == "white" else joined.player_token
        service.apply_action(
            created.room.room_code,
            RoomActionRequest(player_token=token, action=action),
        )

    room = service.apply_action(
        created.room.room_code,
        RoomActionRequest(player_token=joined.player_token, action=_build_ready_sequence()[-1]),
        finalize_autoplay=False,
    )
    assert room.game.autoplay.status == "pending"

    room = service.begin_autoplay(created.room.room_code)
    assert room.game.phase == "autoplay"
    assert room.game.autoplay.status == "running"

    room = service.finalize_autoplay(created.room.room_code)
    assert room.game.phase == "autoplay"
    assert room.game.autoplay.status == "failed"
    assert "Stockfish missing" in (room.game.autoplay.error or "")

    white_view = service.get_room(created.room.room_code, created.player_token)
    black_view = service.get_room(created.room.room_code, joined.player_token)
    assert white_view.room.game.autoplay.status == "failed"
    assert black_view.room.game.autoplay.status == "failed"
    assert white_view.room.game.autoplay.error == black_view.room.game.autoplay.error


def test_player_leave_closes_room_and_normalizes_room_code() -> None:
    service = RoomService(engine_provider=FakeEngineProvider())
    created = service.create_room(CreateRoomRequest())
    joined = service.join_room(JoinRoomRequest(room_code=created.room.room_code))

    room, side = service.leave_room(created.room.room_code.lower(), LeaveRoomRequest(player_token=joined.player_token))

    assert side == "black"
    assert room is None

    try:
        service.get_room(created.room.room_code, created.player_token)
    except RoomNotFoundError:
        pass
    else:
        raise AssertionError("Expected room to close when black leaves.")


def test_white_leave_closes_room_with_mixed_case_code() -> None:
    service = RoomService(engine_provider=FakeEngineProvider())
    created = service.create_room(CreateRoomRequest())
    service.join_room(JoinRoomRequest(room_code=created.room.room_code))

    room, side = service.leave_room(created.room.room_code.lower(), LeaveRoomRequest(player_token=created.player_token))

    assert side == "white"
    assert room is None

    try:
        service.get_room(created.room.room_code, created.player_token)
    except RoomNotFoundError:
        pass
    else:
        raise AssertionError("Expected room to close when white leaves.")


def test_room_version_increments_on_state_changes() -> None:
    service = RoomService(engine_provider=FakeEngineProvider())
    created = service.create_room(CreateRoomRequest())
    created_version = created.room.version

    joined = service.join_room(JoinRoomRequest(room_code=created.room.room_code))
    joined_version = joined.room.version
    assert joined_version == created_version + 1

    connected_room = service.mark_connected(created.room.room_code, created.player_token, True)
    connected_version = connected_room.version
    assert connected_version == joined_version + 1

    updated_room = service.apply_action(
        created.room.room_code,
        RoomActionRequest(
            player_token=created.player_token,
            action=ActionRequest(action_type=ActionType.PLACE_PIECE, side="white", piece_type="P", square="a2"),
        ),
        finalize_autoplay=False,
    )
    assert updated_room.version == connected_version + 1
