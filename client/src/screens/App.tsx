import { useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader, type AppTheme, type HeaderTone } from '../components/AppHeader'
import { AutoplayViewer } from '../components/AutoplayViewer'
import { Board, type BoardSquareData } from '../components/Board'
import { Sidebar } from '../components/Sidebar'
import {
  ApiError,
  applyAction,
  applyRoomAction,
  createRoom,
  createSampleGame,
  createSoloGame,
  getGame,
  getRoom,
  getWebSocketUrl,
  joinRoom,
  leaveRoom,
  type GameMode,
  type GameState,
  type HumanSideChoice,
  type PieceType,
  type RoomEvent,
  type RoomState,
  type RoomStatus,
  type Side,
} from '../lib/api'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const SESSION_STORAGE_GAME_KEY = 'automate-chess-game-id'
const ROOM_SESSION_STORAGE_KEY = 'automate-chess-room-session'
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

interface RoomSession {
  roomCode: string
  playerToken: string
  playerSide: Side
}

interface BootstrapState {
  game: GameState | null
  room: RoomState | null
  roomSession: RoomSession | null
}

let bootstrapPromise: Promise<BootstrapState> | null = null

function getStoredRoomSession(): RoomSession | null {
  const raw = window.sessionStorage.getItem(ROOM_SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as RoomSession
  } catch {
    window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY)
    return null
  }
}

function setStoredRoomSession(session: RoomSession | null) {
  if (!session) {
    window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY)
    return
  }

  window.sessionStorage.setItem(ROOM_SESSION_STORAGE_KEY, JSON.stringify(session))
}

function getInitialGame(): Promise<BootstrapState> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const storedRoomSession = getStoredRoomSession()
      if (storedRoomSession) {
        try {
          const response = await getRoom(storedRoomSession.roomCode, storedRoomSession.playerToken)
          return {
            game: response.room.game,
            room: response.room,
            roomSession: storedRoomSession,
          }
        } catch {
          window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY)
        }
      }

      const existingGameId = window.sessionStorage.getItem(SESSION_STORAGE_GAME_KEY)

      if (existingGameId) {
        try {
          const response = await getGame(existingGameId)
          return { game: response.game, room: null, roomSession: null }
        } catch {
          window.sessionStorage.removeItem(SESSION_STORAGE_GAME_KEY)
        }
      }
      return { game: null, room: null, roomSession: null }
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
  if (mode === 'bot') {
    return 'Solo vs Bot'
  }
  if (mode === 'multiplayer') {
    return 'Multiplayer Room'
  }
  return 'Solo Sandbox'
}

function formatSideLabel(side: Side): string {
  return side[0].toUpperCase() + side.slice(1)
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
  const [joinRoomCode, setJoinRoomCode] = useState('')
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [roomSession, setRoomSession] = useState<RoomSession | null>(null)
  const [roomConnectionState, setRoomConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [selectedPiece, setSelectedPiece] = useState<PieceType | null>('P')
  const [selectedPiecesBySide, setSelectedPiecesBySide] = useState<Record<Side, PieceType | null>>({
    white: 'P',
    black: 'P',
  })
  const [isKingPlacementMode, setIsKingPlacementMode] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('Loading saved game...')
  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(null)
  const [isCalculatingAutoplay, setIsCalculatingAutoplay] = useState(false)
  const [autoplayTransitionLatched, setAutoplayTransitionLatched] = useState(false)
  const [theme, setTheme] = useState<AppTheme>(() => getPreferredTheme())
  const [replayFinished, setReplayFinished] = useState(false)
  const actionInFlightRef = useRef(false)
  const roomStateRef = useRef<RoomState | null>(null)
  const roomVersionRef = useRef<number>(0)
  const syncRoomStateRef = useRef<(() => Promise<boolean>) | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const heartbeatIntervalRef = useRef<number | null>(null)
  const firstSnapshotTimeoutRef = useRef<number | null>(null)
  const pollingIntervalRef = useRef<number | null>(null)

  useEffect(() => {
    roomStateRef.current = roomState
    roomVersionRef.current = roomState?.version ?? 0
  }, [roomState])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const initialState = await getInitialGame()

        if (!cancelled) {
          setGame(initialState.game)
          setRoomState(initialState.room)
          setRoomSession(initialState.roomSession)
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
    if (!game || game.phase !== 'setup' || game.mode !== 'local') {
      return
    }

    setIsKingPlacementMode(false)
    setSelectedPiece(selectedPiecesBySide[game.setup_turn] ?? 'P')
  }, [game?.game_id, game?.mode, game?.phase, game?.setup_turn, selectedPiecesBySide, game])

  useEffect(() => {
    if (!game || game.phase !== 'setup') {
      return
    }

    if (isKingPlacementMode && !getActivePlayerStatus(game).canPlaceKing) {
      setIsKingPlacementMode(false)
    }
  }, [game, isKingPlacementMode])

  useEffect(() => {
    if (!game) {
      setAutoplayTransitionLatched(false)
      return
    }

    const bothKingsPlaced = Boolean(game.white.king_square && game.black.king_square)
    const shouldLatch =
      bothKingsPlaced &&
      game.autoplay.status !== 'ready' &&
      game.autoplay.status !== 'failed'

    setAutoplayTransitionLatched(shouldLatch)
  }, [game])

  function resetToLauncher(message: string | null = null) {
    actionInFlightRef.current = false
    window.sessionStorage.removeItem(SESSION_STORAGE_GAME_KEY)
    setStoredRoomSession(null)
    setGame(null)
    setRoomState(null)
    setRoomSession(null)
    setRoomConnectionState('disconnected')
    setGameSetupMode('local')
    setHumanSideChoice('white')
    setJoinRoomCode('')
    setSelectedPiece('P')
    setSelectedPiecesBySide({
      white: 'P',
      black: 'P',
    })
    setIsKingPlacementMode(false)
    setErrorMessage(message)
    setLoadingMessage('')
    setPendingActionLabel(null)
    setIsCalculatingAutoplay(false)
    setAutoplayTransitionLatched(false)
    setReplayFinished(false)
  }

  useEffect(() => {
    if (!roomSession) {
      setRoomConnectionState('disconnected')
      syncRoomStateRef.current = null
      return
    }

    let active = true
    let socket: WebSocket | null = null

    const clearTimers = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
      if (firstSnapshotTimeoutRef.current !== null) {
        window.clearTimeout(firstSnapshotTimeoutRef.current)
        firstSnapshotTimeoutRef.current = null
      }
      if (pollingIntervalRef.current !== null) {
        window.clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }

    const applySnapshot = (room: RoomState) => {
      const previousRoom = roomStateRef.current
      if (previousRoom && room.version < previousRoom.version) {
        return
      }
      const opponentLeft =
        roomSession.playerSide === 'white' &&
        previousRoom?.black_player &&
        room.black_player === null

      if (opponentLeft) {
        clearTimers()
        if (socket) {
          socket.close()
        }
        resetToLauncher('Opponent left the room.')
        return
      }

      setRoomState(room)
      setGame(room.game)
    }

    const syncRoomState = async (): Promise<boolean> => {
      try {
        const response = await getRoom(roomSession.roomCode, roomSession.playerToken)
        if (active) {
          applySnapshot(response.room)
        }
        return true
      } catch (error) {
        if (active) {
          resetToLauncher(error instanceof ApiError && error.status === 404 ? 'This room was closed.' : getErrorMessage(error))
        }
        return false
      }
    }
    syncRoomStateRef.current = syncRoomState

    const handleVisibilityRefresh = () => {
      if (!active) {
        return
      }
      if (document.visibilityState === 'visible') {
        void syncRoomState()
      }
    }

    const handleWindowFocus = () => {
      if (!active) {
        return
      }
      void syncRoomState()
    }

    const connect = () => {
      if (!active) {
        return
      }

      let receivedSocketSnapshot = false
      const url = new URL(getWebSocketUrl(`/rooms/${roomSession.roomCode}/ws`))
      url.searchParams.set('player_token', roomSession.playerToken)

      setRoomConnectionState('connecting')
      socket = new WebSocket(url.toString())

      socket.onopen = async () => {
        if (!active || !socket) {
          return
        }
        setRoomConnectionState('connected')
        heartbeatIntervalRef.current = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send('ping')
          }
        }, 15000)
        firstSnapshotTimeoutRef.current = window.setTimeout(() => {
          if (active && !receivedSocketSnapshot) {
            void syncRoomState()
          }
        }, 1200)
      }

      socket.onmessage = (event) => {
        if (!active) {
          return
        }
        const message = JSON.parse(event.data) as RoomEvent
        if (message.type === 'snapshot' && message.room) {
          receivedSocketSnapshot = true
          if (firstSnapshotTimeoutRef.current !== null) {
            window.clearTimeout(firstSnapshotTimeoutRef.current)
            firstSnapshotTimeoutRef.current = null
          }
          applySnapshot(message.room)
          return
        }

        if (message.type === 'room_closed') {
          clearTimers()
          resetToLauncher(message.message ?? 'This room was closed.')
        }
      }

      socket.onclose = () => {
        clearTimers()
        if (!active) {
          return
        }
        setRoomConnectionState('disconnected')
        reconnectTimeoutRef.current = window.setTimeout(() => {
          void (async () => {
            const synced = await syncRoomState()
            if (active && synced) {
              connect()
            }
          })()
        }, 1500)
      }
    }

    void (async () => {
      const synced = await syncRoomState()
      if (active && synced) {
        connect()
        pollingIntervalRef.current = window.setInterval(() => {
          void syncRoomState()
        }, 2500)
        document.addEventListener('visibilitychange', handleVisibilityRefresh)
        window.addEventListener('focus', handleWindowFocus)
      }
    })()

    return () => {
      active = false
      syncRoomStateRef.current = null
      clearTimers()
      document.removeEventListener('visibilitychange', handleVisibilityRefresh)
      window.removeEventListener('focus', handleWindowFocus)
      socket?.close()
    }
  }, [roomSession])

  const isBotGame = game?.mode === 'bot'
  const isMultiplayer = game?.mode === 'multiplayer' && !!roomState && !!roomSession
  const isHumanSetupTurn = !!game && (
    isMultiplayer
      ? roomSession?.playerSide === game.setup_turn && roomState?.status === 'active'
      : !isBotGame || game.human_side === game.setup_turn
  )

  async function refreshGame() {
    if (!game || actionInFlightRef.current) {
      return
    }

    actionInFlightRef.current = true
    setPendingActionLabel('Refreshing board state...')
    setErrorMessage(null)

    try {
      if (roomSession && roomState) {
        await (syncRoomStateRef.current?.() ?? Promise.resolve())
      } else {
        const response = await getGame(game.game_id)
        setGame(response.game)
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setPendingActionLabel(null)
      actionInFlightRef.current = false
    }
  }

  async function backToMenu() {
    if (roomSession) {
      try {
        await leaveRoom(roomSession.roomCode, { player_token: roomSession.playerToken })
      } catch {
        // Best-effort cleanup for v1.
      }
    }

    resetToLauncher()
  }

  async function startNewGame(mode: GameMode = 'local', sideChoice: HumanSideChoice = 'white') {
    actionInFlightRef.current = false
    setStoredRoomSession(null)
    setRoomState(null)
    setRoomSession(null)
    setRoomConnectionState('disconnected')
    window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY)
    setLoadingMessage(mode === 'bot' ? 'Creating solo vs bot game...' : 'Creating solo game...')
    setPendingActionLabel(null)
    setErrorMessage(null)
    setIsKingPlacementMode(false)
    setSelectedPiece('P')
    setSelectedPiecesBySide({
      white: 'P',
      black: 'P',
    })
    setIsCalculatingAutoplay(false)
    setAutoplayTransitionLatched(false)
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

  async function handleCreateRoom() {
    actionInFlightRef.current = false
    window.sessionStorage.removeItem(SESSION_STORAGE_GAME_KEY)
    setLoadingMessage('Creating multiplayer room...')
    setPendingActionLabel(null)
    setErrorMessage(null)
    setIsKingPlacementMode(false)
    setSelectedPiece('P')
    setSelectedPiecesBySide({
      white: 'P',
      black: 'P',
    })
    setIsCalculatingAutoplay(false)
    setAutoplayTransitionLatched(false)
    setReplayFinished(false)

    try {
      const response = await createRoom()
      const session: RoomSession = {
        roomCode: response.room.room_code,
        playerToken: response.player_token,
        playerSide: response.player_side,
      }
      setStoredRoomSession(session)
      window.sessionStorage.removeItem(SESSION_STORAGE_GAME_KEY)
      setRoomSession(session)
      setRoomState(response.room)
      setGame(response.room.game)
      setLoadingMessage('')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      setLoadingMessage('')
    }
  }

  async function handleJoinRoom() {
    const normalizedRoomCode = joinRoomCode.trim().toUpperCase()
    if (!normalizedRoomCode) {
      setErrorMessage('Enter a room code first.')
      return
    }

    actionInFlightRef.current = false
    window.sessionStorage.removeItem(SESSION_STORAGE_GAME_KEY)
    setLoadingMessage(`Joining room ${normalizedRoomCode}...`)
    setPendingActionLabel(null)
    setErrorMessage(null)
    setIsKingPlacementMode(false)
    setSelectedPiece('P')
    setSelectedPiecesBySide({
      white: 'P',
      black: 'P',
    })
    setIsCalculatingAutoplay(false)
    setAutoplayTransitionLatched(false)
    setReplayFinished(false)

    try {
      const response = await joinRoom({ room_code: normalizedRoomCode })
      const session: RoomSession = {
        roomCode: response.room.room_code,
        playerToken: response.player_token,
        playerSide: response.player_side,
      }
      setStoredRoomSession(session)
      window.sessionStorage.removeItem(SESSION_STORAGE_GAME_KEY)
      setRoomSession(session)
      setRoomState(response.room)
      setGame(response.room.game)
      setLoadingMessage('')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      setLoadingMessage('')
    }
  }

  async function loadSampleGame() {
    if (isMultiplayer) {
      setErrorMessage('Sample setup is not available in multiplayer rooms.')
      return
    }

    actionInFlightRef.current = false
    setLoadingMessage('Loading sample setup...')
    setPendingActionLabel('Loading sample setup...')
    setErrorMessage(null)
    setIsKingPlacementMode(false)
    setSelectedPiece('P')
    setSelectedPiecesBySide({
      white: 'P',
      black: 'P',
    })
    setIsCalculatingAutoplay(false)
    setAutoplayTransitionLatched(false)
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
    if (triggersAutoplay) {
      setAutoplayTransitionLatched(true)
    }

    try {
      if (isMultiplayer && roomSession && roomState) {
        const response = await applyRoomAction(roomState.room_code, {
          player_token: roomSession.playerToken,
          action: payload,
        })
        const latestRoom = response.room
        if (!roomStateRef.current || latestRoom.version >= roomStateRef.current.version) {
          setRoomState(latestRoom)
          setGame(latestRoom.game)
        }
        await (syncRoomStateRef.current?.() ?? Promise.resolve())
      } else {
        const response = await (
          isBotGame
            ? Promise.all([applyAction(game.game_id, payload), delay(BOT_THINK_DELAY_MS)]).then(
                ([apiResponse]) => apiResponse,
              )
            : applyAction(game.game_id, payload)
        )
        setGame(response.game)
      }
      setIsKingPlacementMode(false)
    } catch (error) {
      setAutoplayTransitionLatched(false)
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
      if (game.mode === 'local') {
        setSelectedPiecesBySide((current) => ({
          ...current,
          [game.setup_turn]: piece,
        }))
      }
      setIsKingPlacementMode(false)
    }

    setErrorMessage(null)
  }

  async function handleFinishSetup() {
    if (!game || actionInFlightRef.current || !isHumanSetupTurn) {
      return
    }

    const sideLabel = formatSideLabel(game.setup_turn)
    const pointsLeft = game[game.setup_turn].points_remaining
    const confirmed = window.confirm(
      `Finish setup for ${sideLabel}?\n\nThis locks spending for this side with ${pointsLeft} point${pointsLeft === 1 ? '' : 's'} remaining.`,
    )

    if (!confirmed) {
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

  function handleDownloadLog() {
    if (!game) {
      return
    }

    const content = [
      'Automate Chess Event Log',
      `Mode: ${formatModeLabel(game.mode)}`,
      `Phase: ${formatPhaseLabel(game.phase)}`,
      `White points: ${game.white.points_remaining}`,
      `Black points: ${game.black.points_remaining}`,
      '',
      ...game.event_log.map((entry, index) => `${index + 1}. ${entry}`),
    ].join('\n')

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `automate-chess-log-${game.game_id}.txt`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
  }

  const boardSquares = useMemo(() => (game ? buildBoard(game) : []), [game])

  if (!game) {
    const isBootstrapping = Boolean(loadingMessage)

    return (
      <div className="shell loading-shell">
        <AppHeader
          primaryPill="New Challenge"
          tone="setup"
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        />
        <div className="launcher-stage">
          <div className="launcher-board-backdrop" aria-hidden="true">
            {Array.from({ length: 49 }, (_, index) => (
              <span
                key={index}
                className={`launcher-board-square ${(Math.floor(index / 7) + (index % 7)) % 2 === 0 ? 'light' : 'dark'}`}
              />
            ))}
          </div>
          <div className="panel loading-panel premium-card launcher-panel">
            <div className="launcher-hero-copy">
              <p className="eyebrow">New Challenge</p>
              <h1>Automate Chess</h1>
              <p className="launcher-copy">
                Build your formation, place the kings last, then watch the finished position resolve through full autoplay.
              </p>
            </div>

            <section className="launcher-tutorial">
              <div className="launcher-tutorial-heading">
                <p className="eyebrow">Quick Start</p>
                <strong>Three simple steps</strong>
              </div>
              <div className="launcher-step-grid">
                <article className="launcher-step-card">
                  <span>1</span>
                  <strong>Choose a mode</strong>
                  <p>Play on the same device with a friend, against the bot, or online with a private room code.</p>
                </article>
                <article className="launcher-step-card">
                  <span>2</span>
                  <strong>Build your setup</strong>
                  <p>Spend your points to buy and place the pieces that will fight for you.</p>
                </article>
                <article className="launcher-step-card">
                  <span>3</span>
                  <strong>Let the fight begin</strong>
                  <p>Watch a grandmaster-level chess engine simulate the battle and see which setup wins.</p>
                </article>
              </div>
            </section>

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
                    <button
                      type="button"
                      className={`choice-pill ${gameSetupMode === 'multiplayer' ? 'selected' : ''}`}
                      onClick={() => setGameSetupMode('multiplayer')}
                    >
                      Multiplayer Room
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

                {gameSetupMode === 'multiplayer' ? (
                  <div className="launcher-group">
                    <span className="launcher-label">Room Access</span>
                    <div className="launcher-choice-row multiplayer-room-row">
                      <button
                        type="button"
                        className="button primary compact-action"
                        onClick={() => {
                          void handleCreateRoom()
                        }}
                      >
                        Create Room
                      </button>
                      <input
                        type="text"
                        className="room-code-input"
                        value={joinRoomCode}
                        onChange={(event) => setJoinRoomCode(event.target.value.toUpperCase())}
                        placeholder="Enter code"
                        maxLength={6}
                      />
                      <button
                        type="button"
                        className="button ghost compact-action"
                        onClick={() => {
                          void handleJoinRoom()
                        }}
                      >
                        Join Room
                      </button>
                    </div>
                  </div>
                ) : null}

                {gameSetupMode !== 'multiplayer' ? (
                  <button
                    type="button"
                    className="button primary launcher-start-button"
                    onClick={() => {
                      void startNewGame(gameSetupMode, humanSideChoice)
                    }}
                  >
                    Start {formatModeLabel(gameSetupMode)}
                  </button>
                ) : null}
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
      </div>
    )
  }

  const isSetupActive = game.phase === 'setup'
  const botTurnActive = isSetupActive && isBotGame && !isHumanSetupTurn
  const multiplayerWaiting = isMultiplayer && roomState?.status === 'waiting'
  const multiplayerSideLabel = roomSession?.playerSide ? roomSession.playerSide[0].toUpperCase() + roomSession.playerSide.slice(1) : null
  const selectedPieceLabel = !isSetupActive
    ? 'Locked'
    : isKingPlacementMode
      ? 'King placement'
      : selectedPiece
        ? PIECE_LABELS[selectedPiece]
        : 'None'
  const activePlayerStatus = getActivePlayerStatus(game)
  const bothKingsPlaced = Boolean(game.white.king_square && game.black.king_square)
  const readyForAutoplay = game.autoplay.status === 'pending' || game.phase === 'ready_for_autoplay'
  const autoplayReady = game.phase === 'autoplay' && game.autoplay.status === 'ready' && !!game.autoplay.initial_fen
  const autoplayPhase = game.phase === 'autoplay'
  const sharedAutoplayPending = game.autoplay.status === 'pending' || game.autoplay.status === 'running'
  const transitionalCalculatingGuard =
    bothKingsPlaced &&
    !autoplayReady &&
    game.autoplay.status !== 'ready' &&
    game.autoplay.status !== 'failed'
  const sharedCalculatingState = readyForAutoplay || sharedAutoplayPending || transitionalCalculatingGuard
  const showCalculatingOverlay =
    autoplayTransitionLatched ||
    (isMultiplayer ? sharedCalculatingState : isCalculatingAutoplay || sharedCalculatingState)
  const phaseBadge = readyForAutoplay ? 'Setup Complete' : formatPhaseLabel(game.phase)
  const headerTone = getHeaderTone(game)
  const headerSecondaryPill = isMultiplayer && roomState
    ? `Room ${roomState.room_code} · ${roomConnectionState}`
    : undefined
  const humanSideLabel = isMultiplayer
    ? multiplayerSideLabel
    : game.human_side
      ? game.human_side[0].toUpperCase() + game.human_side.slice(1)
      : null

  if (autoplayReady) {
    const outcomeLabel = replayFinished ? formatReplayResult(game.autoplay.result ?? game.result) : 'Pending Result'

    return (
      <div className="shell">
        <AppHeader
          primaryPill={outcomeLabel}
          secondaryPill={headerSecondaryPill}
          tone={replayFinished ? 'complete' : 'autoplay'}
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          onBackToMenu={() => {
            void backToMenu()
          }}
        />
        <AutoplayViewer
          game={game}
          onRefresh={() => {
            void refreshGame()
          }}
          onNewGame={() => {
            if (isMultiplayer) {
              void backToMenu()
              return
            }
            void startNewGame(game.mode, game.human_side ?? 'white')
          }}
          onBackToMenu={() => {
            void backToMenu()
          }}
          outcomeKnown={replayFinished}
          onOutcomeReveal={() => setReplayFinished(true)}
        />
      </div>
    )
  }

  if (showCalculatingOverlay) {
    return (
      <div className="shell">
        <AppHeader
          primaryPill="Calculating"
          secondaryPill={headerSecondaryPill}
          tone="autoplay"
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          onBackToMenu={() => {
            void backToMenu()
          }}
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
          secondaryPill={headerSecondaryPill}
          tone="autoplay"
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          onBackToMenu={() => {
            void backToMenu()
          }}
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
                      {game.autoplay.status === 'failed' ? (
                        <button
                          type="button"
                          className="button ghost"
                          onClick={() => {
                            void backToMenu()
                          }}
                        >
                          Back to menu
                        </button>
                      ) : null}
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
        secondaryPill={headerSecondaryPill}
        tone={headerTone}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        onBackToMenu={() => {
          void backToMenu()
        }}
      />

      <main className="layout">
        <section className="board-column">
          <div className="board-stage">
            <div className="stage-heading">
              <div>
                <p className="eyebrow">Arena</p>
                <h2>Formation Board</h2>
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
                selectedModeLabel={multiplayerWaiting ? 'Awaiting opponent' : `${formatSideLabel(game.setup_turn)} to move`}
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
          isMultiplayer={isMultiplayer}
          roomCode={roomState?.room_code ?? null}
          roomStatus={roomState?.status ?? null}
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
          onDownloadLog={handleDownloadLog}
          statusTone={headerTone}
        />
      </main>
    </div>
  )
}
