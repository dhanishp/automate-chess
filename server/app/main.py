from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.game.engine import EngineError, EngineUnavailableError
from app.game.models import ActionRequest, ApiResponse, CreateSoloGameRequest
from app.game.rules import RuleViolation
from app.game.service import service

app = FastAPI(title="Automate Chess API", version="0.1.0")

# Local frontend dev runs on Vite, so allow those origins during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/games/solo", response_model=ApiResponse)
def create_solo_game(request: CreateSoloGameRequest) -> ApiResponse:
    game = service.create_solo_game(request)
    return ApiResponse(message="Solo game created.", game=game)


@app.get("/games/{game_id}", response_model=ApiResponse)
def get_game(game_id: str) -> ApiResponse:
    try:
        game = service.get_game(game_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ApiResponse(game=game)


@app.post("/games/{game_id}/actions", response_model=ApiResponse)
def apply_action(game_id: str, request: ActionRequest) -> ApiResponse:
    try:
        game = service.apply_action(game_id, request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuleViolation as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except EngineUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except EngineError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return ApiResponse(message="Action applied.", game=game)
