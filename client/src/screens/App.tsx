import { useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader, type AppTheme, type HeaderTone } from '../components/AppHeader'
import { AutoplayViewer } from '../components/AutoplayViewer'
import { Board, type BoardSquareData } from '../components/Board'
import { Sidebar } from '../components/Sidebar'
import {
  ApiError,
  applyAction,
  createSampleGame,
  createSoloGame,
  getGame,
  type GameMode,
  type GameState,
  type HumanSideChoice,
  type PieceType,
  type Side,
} from '../lib/api'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const SESSION_STORAGE_GAME_KEY = 'automate-chess-game-id'
const THEME_STORAGE_KEY = 'automate-chess-theme'
const BOT_THINK_DELAY_MS = 700
const PIECE_LABELS: Record<PieceType, string> = {
  P: 'Pawn',
  N: 'Knight',
  B: 'Bishop',
  R: 'Rook',
  Q: 'Queen',
  K: 'King',
}

let bootstrapPromise: Promise<GameState | null> | null = null

function getInitialGame(): Promise<GameState | null> {
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
      return null
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

function formatReplayResult(result: string | null | undefined): string {
  switch (result) {
    case '1-0':
      return 'White wins'
    case '0-1':
      return 'Black wins'
    case '1/2-1/2':
      return 'Draw'
    default:
      return result ?? 'Pending'
  }
}

function formatModeLabel(mode: GameMode): string {
  return mode === 'bot' ? 'Solo vs Bot' : 'Solo Sandbox'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function getPreferredTheme(): AppTheme {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' ? 'light' : 'dark'
}

function getHeaderTone(game: GameState, replayFinished = false): HeaderTone {
  if (replayFinished) {
    return 'complete'
  }

  if (game.phase === 'setup' || game.phase === 'ready_for_autoplay') {
    return 'setup'
  }

  return 'autoplay'
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
  const [gameSetupMode, setGameSetupMode] = useState<GameMode>('local')
  const [humanSideChoice, setHumanSideChoice] = useState<HumanSideChoice>('white')
  const [selectedPiece, setSelectedPiece] = useState<PieceType | null>('P')
  const [isKingPlacementMode, setIsKingPlacementMode] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('Loading saved game...')
  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(null)
  const [isCalculatingAutoplay, setIsCalculatingAutoplay] = useState(false)
  const [theme, setTheme] = useState<AppTheme>(() => getPreferredTheme())
  const [replayFinished, setReplayFinished] = useState(false)
  const actionInFlightRef = useRef(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

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

    if (game.phase !== 'autoplay') {
      setReplayFinished(false)
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

  const isBotGame = game?.mode === 'bot'
  const isHumanSetupTurn = !!game && (!isBotGame || game.human_side === game.setup_turn)

  async function refreshGame() {
    if (!game || actionInFlightRef.current) {
      return
    }

    actionInFlightRef.current = true
    setPendingActionLabel('Refreshing board state...')
    setErrorMessage(null)

    try {
      const response = await getGame(game.game_id)
      setGame(response.game)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setPendingActionLabel(null)
      actionInFlightRef.current = false
    }
  }

  function backToMenu() {
    actionInFlightRef.current = false
    window.sessionStorage.removeItem(SESSION_STORAGE_GAME_KEY)
    setGame(null)
    setGameSetupMode('local')
    setHumanSideChoice('white')
    setSelectedPiece('P')
    setIsKingPlacementMode(false)
    setErrorMessage(null)
    setLoadingMessage('')
    setPendingActionLabel(null)
    setIsCalculatingAutoplay(false)
    setReplayFinished(false)
  }

  async function startNewGame(mode: GameMode = 'local', sideChoice: HumanSideChoice = 'white') {
    actionInFlightRef.current = false
    setLoadingMessage(mode === 'bot' ? 'Creating solo vs bot game...' : 'Creating solo game...')
    setPendingActionLabel(null)
    setErrorMessage(null)
    setIsKingPlacementMode(false)
    setSelectedPiece('P')
    setIsCalculatingAutoplay(false)
    setReplayFinished(false)

    try {
      const response = await (
        mode === 'bot'
          ? Promise.all([createSoloGame({ mode, human_side: sideChoice }), delay(BOT_THINK_DELAY_MS)]).then(
              ([apiResponse]) => apiResponse,
            )
          : createSoloGame({ mode, human_side: sideChoice })
      )
      window.sessionStorage.setItem(SESSION_STORAGE_GAME_KEY, response.game.game_id)
      setGame(response.game)
      setLoadingMessage('')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      setLoadingMessage('')
    }
  }

  async function loadSampleGame() {
    actionInFlightRef.current = false
    setLoadingMessage('Loading sample setup...')
    setPendingActionLabel('Loading sample setup...')
    setErrorMessage(null)
    setIsKingPlacementMode(false)
    setSelectedPiece('P')
    setIsCalculatingAutoplay(false)
    setReplayFinished(false)

    try {
      const response = await createSampleGame({
        mode: game?.mode ?? 'local',
        human_side: game?.human_side ?? humanSideChoice,
      })
      window.sessionStorage.setItem(SESSION_STORAGE_GAME_KEY, response.game.game_id)
      setGame(response.game)
      setLoadingMessage('')
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
    if (!game || actionInFlightRef.current) {
      return
    }

    const triggersAutoplay =
      payload.action_type === 'place_king' &&
      !game[payload.side].king_square &&
      game[payload.side === 'white' ? 'black' : 'white'].king_square !== null

    actionInFlightRef.current = true
    const pendingLabel = isBotGame ? `${label} Waiting for bot response...` : label
    setPendingActionLabel(pendingLabel)
    setErrorMessage(null)
    setIsCalculatingAutoplay(triggersAutoplay)

    try {
      const response = await (
        isBotGame
          ? Promise.all([applyAction(game.game_id, payload), delay(BOT_THINK_DELAY_MS)]).then(
              ([apiResponse]) => apiResponse,
            )
          : applyAction(game.game_id, payload)
      )
      setGame(response.game)
      setIsKingPlacementMode(false)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setPendingActionLabel(null)
      setIsCalculatingAutoplay(false)
      actionInFlightRef.current = false
    }
  }

  async function handleSquareClick(square: string) {
    if (!game || pendingActionLabel || actionInFlightRef.current || !isHumanSetupTurn) {
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
    if (!game || game.phase !== 'setup' || pendingActionLabel || actionInFlightRef.current || !isHumanSetupTurn) {
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
    if (!game || actionInFlightRef.current || !isHumanSetupTurn) {
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
    const isBootstrapping = Boolean(loadingMessage)

    return (
      <div className="shell loading-shell">
        <div className="panel loading-panel premium-card launcher-panel">
          <div>
            <p className="eyebrow">New Challenge</p>
            <h1>Automate Chess</h1>
            <p className="launcher-copy">
              Choose a local sandbox or a solo-vs-bot setup game. The bot handles only setup turns; finished positions still resolve through the existing autoplay replay.
            </p>
          </div>

          {isBootstrapping ? (
            <p>{loadingMessage}</p>
          ) : (
            <div className="launcher-controls">
              <div className="launcher-group">
                <span className="launcher-label">Mode</span>
                <div className="launcher-choice-row">
                  <button
                    type="button"
                    className={`choice-pill ${gameSetupMode === 'local' ? 'selected' : ''}`}
                    onClick={() => setGameSetupMode('local')}
                  >
                    Solo Sandbox
                  </button>
                  <button
                    type="button"
                    className={`choice-pill ${gameSetupMode === 'bot' ? 'selected' : ''}`}
                    onClick={() => setGameSetupMode('bot')}
                  >
                    Solo vs Bot
                  </button>
                </div>
              </div>

              {gameSetupMode === 'bot' ? (
                <div className="launcher-group">
                  <span className="launcher-label">Human Side</span>
                  <div className="launcher-choice-row">
                    {(['white', 'black', 'random'] as HumanSideChoice[]).map((sideChoice) => (
                      <button
                        key={sideChoice}
                        type="button"
                        className={`choice-pill ${humanSideChoice === sideChoice ? 'selected' : ''}`}
                        onClick={() => setHumanSideChoice(sideChoice)}
                      >
                        {sideChoice[0].toUpperCase() + sideChoice.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                className="button primary launcher-start-button"
                onClick={() => {
                  void startNewGame(gameSetupMode, humanSideChoice)
                }}
              >
                Start {formatModeLabel(gameSetupMode)}
              </button>
            </div>
          )}

          {errorMessage ? (
            <>
              <p className="error-message">{errorMessage}</p>
              <button type="button" className="button ghost" onClick={() => window.location.reload()}>
                Retry restore
              </button>
            </>
          ) : null}
        </div>
      </div>
    )
  }

  const isSetupActive = game.phase === 'setup'
  const botTurnActive = isSetupActive && isBotGame && !isHumanSetupTurn
  const selectedModeLabel = !isSetupActive
    ? game.phase === 'ready_for_autoplay'
      ? 'Setup complete'
      : botTurnActive
        ? 'Bot is choosing a setup move'
      : formatPhaseLabel(game.phase)
    : isKingPlacementMode
      ? `King placement for ${game.setup_turn}`
      : botTurnActive
        ? `${game.bot_side} bot to move`
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
  const autoplayReady = game.phase === 'autoplay' && game.autoplay.status === 'ready' && !!game.autoplay.initial_fen
  const autoplayPhase = game.phase === 'autoplay'
  const phaseBadge = readyForAutoplay ? 'Setup Complete' : formatPhaseLabel(game.phase)
  const headerTone = getHeaderTone(game)
  const humanSideLabel = game.human_side ? game.human_side[0].toUpperCase() + game.human_side.slice(1) : null

  if (autoplayReady) {
    const outcomeLabel = replayFinished ? formatReplayResult(game.autoplay.result ?? game.result) : 'Pending Result'

    return (
      <div className="shell">
        <AppHeader
          primaryPill={outcomeLabel}
          tone={replayFinished ? 'complete' : 'autoplay'}
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        />
        <AutoplayViewer
          game={game}
          onRefresh={() => {
            void refreshGame()
          }}
          onNewGame={() => {
            void startNewGame(game.mode, game.human_side ?? 'white')
          }}
          onBackToMenu={backToMenu}
          outcomeKnown={replayFinished}
          onOutcomeReveal={() => setReplayFinished(true)}
        />
      </div>
    )
  }

  if (isCalculatingAutoplay) {
    return (
      <div className="shell">
        <AppHeader
          primaryPill="Calculating"
          tone="autoplay"
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        />

        <main className="layout">
          <section className="board-column">
            <div className="board-stage">
              <div className="stage-heading">
                <div>
                  <p className="eyebrow">Engine Transition</p>
                  <h2>Calculating autoplay...</h2>
                </div>
              </div>

              <section className="panel board-panel premium-card compact-board-panel">
                <div className="board-overlay-shell">
                  <Board
                    activeSide={game.setup_turn}
                    interactive={false}
                    disabledAppearance={false}
                    selectedSquare={null}
                    selectedModeLabel="Final setup position"
                    squares={boardSquares}
                    onSquareClick={() => {}}
                  />
                  <div className="board-overlay">
                    <section className="board-overlay-card board-overlay-card-loading">
                      <div className="loading-indicator" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div>
                        <p className="eyebrow">Engine is preparing the game</p>
                        <h3>Calculating autoplay...</h3>
                        <p>The starting position is locked in. Stockfish is generating the full engine-vs-engine replay from this setup now.</p>
                      </div>
                    </section>
                  </div>
                </div>
              </section>
            </div>
          </section>

          <aside className="sidebar">
            <section className="panel premium-card status-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Current Status</p>
                  <h2 className="status-title">Calculating</h2>
                </div>
              </div>

              <div className="status-line">
                <span className="live-dot tone-autoplay on" />
                <strong>Generating autoplay replay</strong>
                <span className="status-chip tone-autoplay">Working</span>
              </div>

              <div className="status-metrics">
                <div className="metric-card emphasis">
                  <span>Phase</span>
                  <strong>Autoplay</strong>
                </div>
                <div className="metric-card">
                  <span>Status</span>
                  <strong>Calculating</strong>
                </div>
                <div className="metric-card">
                  <span>White pieces</span>
                  <strong>{game.white.pieces.length + (game.white.king_square ? 1 : 0)}</strong>
                </div>
                <div className="metric-card">
                  <span>Black pieces</span>
                  <strong>{game.black.pieces.length + (game.black.king_square ? 1 : 0)}</strong>
                </div>
              </div>

              {pendingActionLabel ? <p className="status-message">{pendingActionLabel}</p> : null}
              {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
              <button type="button" className="button ghost secondary-utility-button" onClick={backToMenu}>
                Back to menu
              </button>
            </section>
          </aside>
        </main>
      </div>
    )
  }

  if (autoplayPhase) {
    const autoplayHeadline =
      game.autoplay.status === 'failed'
        ? 'Autoplay generation failed'
        : game.autoplay.status === 'running'
          ? 'Generating autoplay replay'
          : 'Autoplay replay pending'
    const autoplayMessage =
      game.autoplay.error ??
      (game.autoplay.status === 'running'
        ? 'The backend is generating the engine-vs-engine replay from the finished setup.'
        : 'The finished setup is locked in, but replay data is not ready yet.')

    return (
      <div className="shell">
        <AppHeader
          primaryPill={game.autoplay.status}
          tone="autoplay"
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        />

        <main className="layout">
          <section className="board-column">
            <div className="board-stage">
              <div className="stage-heading">
                <div>
                  <p className="eyebrow">Replay Status</p>
                  <h2>{autoplayHeadline}</h2>
                </div>
              </div>

              <section className="panel board-panel premium-card compact-board-panel">
                <div className="board-overlay-shell">
                  <Board
                    activeSide={game.setup_turn}
                    interactive={false}
                    disabledAppearance={false}
                    selectedSquare={null}
                    selectedModeLabel="Finished setup position"
                    squares={boardSquares}
                    onSquareClick={() => {}}
                  />
                  <div className="board-overlay">
                    <section className="board-overlay-card">
                      <div>
                        <p className="eyebrow">Finished Setup</p>
                        <h3>{autoplayHeadline}</h3>
                        <p>{autoplayMessage}</p>
                      </div>
                      <button
                        type="button"
                        className="button primary"
                        onClick={() => {
                          void refreshGame()
                        }}
                      >
                        Refresh replay state
                      </button>
                      <button type="button" className="button ghost" onClick={backToMenu}>
                        Back to menu
                      </button>
                    </section>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="shell">
      <AppHeader
        primaryPill={phaseBadge}
        tone={headerTone}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      />

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
                  <p>The formation phase is complete and both kings are placed. The backend should generate an autoplay replay from this position next.</p>
                </div>
              </section>
            ) : null}

            <section className="panel board-panel premium-card">
              <Board
                activeSide={game.setup_turn}
                interactive={isSetupActive && isHumanSetupTurn && pendingActionLabel === null}
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
          isBotGame={isBotGame}
          humanSideLabel={humanSideLabel}
          isHumanSetupTurn={isHumanSetupTurn}
          onSelectPiece={handleSelectPiece}
          onFinishSetup={() => {
            void handleFinishSetup()
          }}
          onRefresh={() => {
            void refreshGame()
          }}
          onLoadSample={() => {
            void loadSampleGame()
          }}
          onBackToMenu={backToMenu}
          statusTone={headerTone}
        />
      </main>
    </div>
  )
}
