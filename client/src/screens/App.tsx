import { useEffect, useMemo, useState } from 'react'
import { Board, type BoardSquareData } from '../components/Board'
import { Sidebar } from '../components/Sidebar'
import {
  ApiError,
  applyAction,
  createSoloGame,
  getApiBaseUrl,
  getGame,
  type GameState,
  type PieceType,
  type Side,
} from '../lib/api'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const SESSION_STORAGE_GAME_KEY = 'automate-chess-game-id'
const PIECE_LABELS: Record<PieceType, string> = {
  P: 'Pawn',
  N: 'Knight',
  B: 'Bishop',
  R: 'Rook',
  Q: 'Queen',
  K: 'King',
}

let bootstrapPromise: Promise<GameState> | null = null

function getInitialGame(): Promise<GameState> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const existingGameId = window.sessionStorage.getItem(SESSION_STORAGE_GAME_KEY)

      if (existingGameId) {
        try {
          const response = await getGame(existingGameId)
          return response.game
        } catch {
          window.sessionStorage.removeItem(SESSION_STORAGE_GAME_KEY)
        }
      }

      const response = await createSoloGame()
      window.sessionStorage.setItem(SESSION_STORAGE_GAME_KEY, response.game.game_id)
      return response.game
    })().finally(() => {
      bootstrapPromise = null
    })
  }

  return bootstrapPromise
}

function buildBoard(game: GameState): BoardSquareData[] {
  const placements = new Map<string, BoardSquareData>()

  for (const side of ['white', 'black'] as Side[]) {
    for (const piece of game[side].pieces) {
      placements.set(piece.square, { square: piece.square, piece: piece.type, side })
    }

    if (game[side].king_square) {
      placements.set(game[side].king_square, { square: game[side].king_square, piece: 'K', side })
    }
  }

  const squares: BoardSquareData[] = []

  for (let rank = 8; rank >= 1; rank -= 1) {
    for (const file of FILES) {
      const square = `${file}${rank}`
      squares.push(placements.get(square) ?? { square, piece: null, side: null })
    }
  }

  return squares
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong while talking to the backend.'
}

function formatPhaseLabel(phase: GameState['phase']): string {
  return phase
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function getActivePlayerStatus(game: GameState) {
  const activePlayer = game[game.setup_turn]
  const pawnsPlaced = activePlayer.pieces.filter((piece) => piece.type === 'P').length
  const mandatoryPawnsRemaining = Math.max(game.rules.mandatory_pawns - pawnsPlaced, 0)
  const hasMinimumPawns = mandatoryPawnsRemaining === 0
  const spendingComplete = activePlayer.finished_spending || activePlayer.points_remaining === 0
  const legacyInvalidSide = (['white', 'black'] as Side[]).find((side) => {
    const player = game[side]
    const sidePawnsPlaced = player.pieces.filter((piece) => piece.type === 'P').length
    return player.finished_spending && sidePawnsPlaced < game.rules.mandatory_pawns && !player.king_square
  })

  let finishSetupReason: string | null = null
  if (activePlayer.finished_spending) {
    finishSetupReason = 'This side already finished spending.'
  } else if (!hasMinimumPawns) {
    finishSetupReason = `${mandatoryPawnsRemaining} more mandatory pawn${mandatoryPawnsRemaining === 1 ? '' : 's'} needed before finishing setup.`
  }

  let kingPlacementReason: string | null = null
  if (activePlayer.king_square) {
    kingPlacementReason = 'This side has already placed its king.'
  } else if (!hasMinimumPawns) {
    kingPlacementReason = `${mandatoryPawnsRemaining} more mandatory pawn${mandatoryPawnsRemaining === 1 ? '' : 's'} needed before king placement is legal.`
  } else if (!spendingComplete) {
    kingPlacementReason = 'Finish spending, or reach zero points, before placing the king.'
  }

  let blockingMessage: string | null = null
  if (legacyInvalidSide) {
    blockingMessage = `This game is stuck in an older invalid state: ${legacyInvalidSide} already finished spending without enough pawns, so king placement cannot become legal.`
  }

  return {
    canFinishSetup: !activePlayer.finished_spending && hasMinimumPawns,
    canPlaceKing: !activePlayer.king_square && hasMinimumPawns && spendingComplete,
    finishSetupReason,
    kingPlacementReason,
    blockingMessage,
  }
}

export function App() {
  const [game, setGame] = useState<GameState | null>(null)
  const [selectedPiece, setSelectedPiece] = useState<PieceType | null>('P')
  const [isKingPlacementMode, setIsKingPlacementMode] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('Creating solo game...')
  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const initialGame = await getInitialGame()

        if (!cancelled) {
          setGame(initialGame)
          setErrorMessage(null)
          setLoadingMessage('')
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error))
          setLoadingMessage('')
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!game) {
      return
    }

    if (game.phase !== 'setup') {
      setIsKingPlacementMode(false)
      setSelectedPiece(null)
    }
  }, [game])

  useEffect(() => {
    if (!game || game.phase !== 'setup') {
      return
    }

    if (isKingPlacementMode && !getActivePlayerStatus(game).canPlaceKing) {
      setIsKingPlacementMode(false)
    }
  }, [game, isKingPlacementMode])

  async function refreshGame() {
    if (!game) {
      return
    }

    setPendingActionLabel('Refreshing board state...')
    setErrorMessage(null)

    try {
      const response = await getGame(game.game_id)
      setGame(response.game)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setPendingActionLabel(null)
    }
  }

  async function submitAction(payload: {
    action_type: 'place_piece' | 'finish_setup' | 'place_king'
    side: Side
    piece_type?: PieceType
    square?: string
  }, label: string) {
    if (!game) {
      return
    }

    setPendingActionLabel(label)
    setErrorMessage(null)

    try {
      const response = await applyAction(game.game_id, payload)
      setGame(response.game)
      setIsKingPlacementMode(false)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setPendingActionLabel(null)
    }
  }

  async function handleSquareClick(square: string) {
    if (!game || pendingActionLabel) {
      return
    }

    if (isKingPlacementMode) {
      await submitAction(
        {
          action_type: 'place_king',
          side: game.setup_turn,
          square,
        },
        `Attempting king placement on ${square}...`,
      )
      return
    }

    if (!selectedPiece) {
      setErrorMessage('Select a non-king piece first, or use Place king.')
      return
    }

    await submitAction(
      {
        action_type: 'place_piece',
        side: game.setup_turn,
        piece_type: selectedPiece,
        square,
      },
      `Attempting ${selectedPiece} on ${square}...`,
    )
  }

  function handleSelectPiece(piece: PieceType) {
    if (!game || game.phase !== 'setup') {
      return
    }

    if (piece === 'K') {
      setSelectedPiece(null)
      setIsKingPlacementMode(true)
    } else {
      setSelectedPiece(piece)
      setIsKingPlacementMode(false)
    }

    setErrorMessage(null)
  }

  async function handleFinishSetup() {
    if (!game) {
      return
    }

    await submitAction(
      {
        action_type: 'finish_setup',
        side: game.setup_turn,
      },
      `Finishing setup for ${game.setup_turn}...`,
    )
  }

  const boardSquares = useMemo(() => (game ? buildBoard(game) : []), [game])

  if (!game) {
    return (
      <div className="shell loading-shell">
        <div className="panel loading-panel">
          <h1>Automate Chess</h1>
          <p>{loadingMessage || 'Loading game state...'}</p>
          {errorMessage ? (
            <>
              <p className="error-message">{errorMessage}</p>
              <button type="button" className="button primary" onClick={() => window.location.reload()}>
                Retry
              </button>
            </>
          ) : null}
        </div>
      </div>
    )
  }

  const isSetupActive = game.phase === 'setup'
  const selectedModeLabel = !isSetupActive
    ? game.phase === 'ready_for_autoplay'
      ? 'Setup complete'
      : formatPhaseLabel(game.phase)
    : isKingPlacementMode
      ? `King placement for ${game.setup_turn}`
      : selectedPiece
        ? `${game.setup_turn} placing ${PIECE_LABELS[selectedPiece]}`
        : 'Select a piece'
  const selectedPieceLabel = !isSetupActive
    ? 'Locked'
    : isKingPlacementMode
      ? 'King placement'
      : selectedPiece
        ? PIECE_LABELS[selectedPiece]
        : 'None'
  const activePlayerStatus = getActivePlayerStatus(game)
  const readyForAutoplay = game.phase === 'ready_for_autoplay'
  const phaseBadge = readyForAutoplay ? 'Setup Complete' : formatPhaseLabel(game.phase)
  const turnBadge = isSetupActive ? `${game.setup_turn[0].toUpperCase() + game.setup_turn.slice(1)} Turn` : 'Setup Locked'

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="wordmark-row">
            <h1>Automate Chess</h1>
          </div>
        </div>
        <div className="topbar-meta">
          <div className={`pill ${isSetupActive ? 'live-pill' : ''}`}>{phaseBadge}</div>
          <div className="pill">{turnBadge}</div>
        </div>
      </header>

      <main className="layout">
        <section className="board-column">
          <div className="board-stage">
            <div className="stage-heading">
              <div>
                <p className="eyebrow">Board Control</p>
                <h2>{selectedModeLabel}</h2>
              </div>
            </div>

            {readyForAutoplay ? (
              <section className="panel premium-card transition-card">
                <div>
                  <p className="eyebrow">Next Stage</p>
                  <h3>Ready for autoplay</h3>
                  <p>The formation phase is complete and both kings are placed. Autoplay is the next stage, but that viewer has not been wired yet.</p>
                </div>
              </section>
            ) : null}

            <section className="panel board-panel premium-card">
              <Board
                activeSide={game.setup_turn}
                interactive={isSetupActive && pendingActionLabel === null}
                selectedSquare={null}
                selectedModeLabel={selectedModeLabel}
                squares={boardSquares}
                onSquareClick={(square) => {
                  void handleSquareClick(square)
                }}
              />
            </section>
          </div>
        </section>

        <Sidebar
          game={game}
          selectedPiece={selectedPiece}
          selectedPieceLabel={selectedPieceLabel}
          isKingPlacementMode={isKingPlacementMode}
          isSetupActive={isSetupActive}
          errorMessage={errorMessage}
          blockingMessage={activePlayerStatus.blockingMessage}
          pendingActionLabel={pendingActionLabel}
          canFinishSetup={activePlayerStatus.canFinishSetup}
          canPlaceKing={activePlayerStatus.canPlaceKing}
          finishSetupReason={activePlayerStatus.finishSetupReason}
          kingPlacementReason={activePlayerStatus.kingPlacementReason}
          onSelectPiece={handleSelectPiece}
          onFinishSetup={() => {
            void handleFinishSetup()
          }}
          onRefresh={() => {
            void refreshGame()
          }}
        />
      </main>
    </div>
  )
}
