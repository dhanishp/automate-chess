import { useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader, type AppTheme, type HeaderTone } from '../components/AppHeader'
import { AutoplayViewer } from '../components/AutoplayViewer'
import { Board, type BoardSquareData } from '../components/Board'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { Sidebar } from '../components/Sidebar'
import {
  ApiError,
  abandonGame,
  abandonGameOnUnload,
  applyAction,
  applyRoomAction,
  createRoom,
  createSampleGame,
  createSoloGame,
  getGame,
  getOpenRooms,
  getRoom,
  getStats,
  getWebSocketUrl,
  joinRoom,
  leaveRoom,
  warmupEngine,
  type GameMode,
  type GameState,
  type HumanSideChoice,
  type OpenRoomSummary,
  type PieceType,
  type ReadyResponse,
  type RoomEvent,
  type RoomState,
  type RoomVisibility,
  type Side,
  type StatsResponse,
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
  message: string | null
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
            message: null,
          }
        } catch (error) {
          window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY)
          if (error instanceof ApiError && error.status === 404) {
            return {
              game: null,
              room: null,
              roomSession: null,
              message: 'This room was closed or expired due to inactivity. Return to the menu to start again.',
            }
          }
        }
      }

      const existingGameId = window.sessionStorage.getItem(SESSION_STORAGE_GAME_KEY)

      if (existingGameId) {
        try {
          const response = await getGame(existingGameId)
          return { game: response.game, room: null, roomSession: null, message: null }
        } catch (error) {
          window.sessionStorage.removeItem(SESSION_STORAGE_GAME_KEY)
          if (error instanceof ApiError && error.status === 404) {
            return {
              game: null,
              room: null,
              roomSession: null,
              message: 'Saved game expired after a server restart or idle cleanup. Start a new battle from the menu.',
            }
          }
        }
      }
      return { game: null, room: null, roomSession: null, message: null }
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
    return sanitizeErrorMessage(error.message)
  }

  if (error instanceof Error) {
    return sanitizeErrorMessage(error.message)
  }

  return 'Something went wrong while talking to the backend.'
}

function sanitizeErrorMessage(message: string): string {
  if (/body is disturbed|body.*locked|already read/i.test(message)) {
    return 'The server response could not be read. Try again in a moment.'
  }

  return message
}

function formatPhaseLabel(phase: GameState['phase']): string {
  if (phase === 'ready_for_autoplay') {
    return 'Battle Ready'
  }
  if (phase === 'autoplay') {
    return 'Battle'
  }

  return phase
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function formatModeLabel(mode: GameMode): string {
  if (mode === 'bot') {
    return 'Singleplayer vs Bot'
  }
  if (mode === 'multiplayer') {
    return 'Multiplayer Room'
  }
  return 'Solo Sandbox'
}

function formatSideLabel(side: Side): string {
  return side[0].toUpperCase() + side.slice(1)
}

function getOpponentSide(side: Side): Side {
  return side === 'white' ? 'black' : 'white'
}

function getOccupiedSquares(game: GameState): Set<string> {
  const occupied = new Set<string>()

  for (const side of ['white', 'black'] as Side[]) {
    for (const piece of game[side].pieces) {
      occupied.add(piece.square)
    }

    if (game[side].king_square) {
      occupied.add(game[side].king_square)
    }
  }

  return occupied
}

function getSquaresForRanks(ranks: number[]): string[] {
  return FILES.flatMap((file) => ranks.map((rank) => `${file}${rank}`))
}

function canKeepPawnPathViable(
  game: GameState,
  side: Side,
  piece: PieceType,
  square: string,
  occupiedSquares: Set<string>,
): boolean {
  const player = game[side]
  const pawnCost = game.rules.costs.P
  const cost = game.rules.costs[piece]
  const pawnCountAfterMove = player.pieces.filter((placed) => placed.type === 'P').length + (piece === 'P' ? 1 : 0)
  const remainingRequiredPawns = Math.max(game.rules.mandatory_pawns - pawnCountAfterMove, 0)
  const remainingPoints = player.points_remaining - cost

  if (remainingPoints < remainingRequiredPawns * pawnCost) {
    return false
  }

  const occupiedAfterMove = new Set(occupiedSquares)
  occupiedAfterMove.add(square)
  const pawnSquares = getSquaresForRanks(game.rules.pawn_ranks[side])
  const remainingPawnSquares = pawnSquares.filter((candidate) => !occupiedAfterMove.has(candidate)).length

  return remainingPawnSquares >= remainingRequiredPawns
}

function getLegalPlacementSquares(
  game: GameState,
  selectedPiece: PieceType | null,
  isKingPlacementMode: boolean,
  canPlaceKing: boolean,
  canAct: boolean,
): string[] {
  if (game.phase !== 'setup' || !canAct) {
    return []
  }

  const side = game.setup_turn
  const occupiedSquares = getOccupiedSquares(game)

  if (isKingPlacementMode) {
    if (!canPlaceKing) {
      return []
    }

    return getSquaresForRanks(game.rules.king_ranks[side]).filter((square) => !occupiedSquares.has(square))
  }

  if (!selectedPiece || selectedPiece === 'K') {
    return []
  }

  const player = game[side]
  if (player.finished_spending || game.rules.costs[selectedPiece] > player.points_remaining) {
    return []
  }

  const candidateRanks = selectedPiece === 'P' ? game.rules.pawn_ranks[side] : game.rules.non_king_ranks[side]
  return getSquaresForRanks(candidateRanks)
    .filter((square) => !occupiedSquares.has(square))
    .filter((square) => canKeepPawnPathViable(game, side, selectedPiece, square, occupiedSquares))
}

function formatRoomClosedMessage(message: string | null | undefined): string {
  const guidance = 'This room was closed. Return to the main menu to start again.'
  if (!message) {
    return guidance
  }

  const reason = message
    .replace(' left. Room closed.', ' left the room.')
    .replace(/room closed\.?/gi, '')
    .trim()

  return reason ? `${reason} ${guidance}` : guidance
}

function isClosedRoomMessage(message: string | null): boolean {
  return Boolean(message && /room closed|room was closed|left the room|opponent left/i.test(message))
}

function getRoomConnectionTone(state: 'disconnected' | 'connecting' | 'connected'): HeaderTone {
  if (state === 'connected') {
    return 'connected'
  }

  if (state === 'connecting') {
    return 'connecting'
  }

  return 'disconnected'
}

function isAutoplayTerminal(game: GameState): boolean {
  return (game.autoplay.status === 'ready' && Boolean(game.autoplay.initial_fen)) || game.autoplay.status === 'failed'
}

function shouldLatchCalculatingOverlay(game: GameState): boolean {
  if (isAutoplayTerminal(game)) {
    return false
  }

  const bothKingsPlaced = Boolean(game.white.king_square && game.black.king_square)
  const sharedAutoplayPending = game.autoplay.status === 'pending' || game.autoplay.status === 'running'
  const setupTransitionWithoutReplay =
    game.phase === 'ready_for_autoplay' ||
    (game.phase === 'autoplay' && !game.autoplay.initial_fen)

  return (
    sharedAutoplayPending ||
    bothKingsPlaced ||
    setupTransitionWithoutReplay
  )
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

function getHeaderTone(game: GameState, replayFinished = false): 'setup' | 'autoplay' | 'complete' {
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
  let sharedRequirementReason: string | null = null
  if (activePlayer.finished_spending) {
    finishSetupReason = 'This side already finished spending.'
  } else if (!hasMinimumPawns) {
    sharedRequirementReason = `Place at least ${game.rules.mandatory_pawns} pawns before finishing setup or placing your king.`
  }

  let kingPlacementReason: string | null = null
  if (activePlayer.king_square) {
    kingPlacementReason = 'This side has already placed its king.'
  } else if (!hasMinimumPawns) {
    kingPlacementReason = null
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
    sharedRequirementReason,
    blockingMessage,
  }
}

export function App() {
  const [game, setGame] = useState<GameState | null>(null)
  const [gameSetupMode, setGameSetupMode] = useState<GameMode>('local')
  const [humanSideChoice, setHumanSideChoice] = useState<HumanSideChoice>('white')
  const [joinRoomCode, setJoinRoomCode] = useState('')
  const [roomVisibility, setRoomVisibility] = useState<RoomVisibility>('private')
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [roomSession, setRoomSession] = useState<RoomSession | null>(null)
  const [roomConnectionState, setRoomConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [selectedPiece, setSelectedPiece] = useState<PieceType | null>('P')
  const [selectedPiecesBySide, setSelectedPiecesBySide] = useState<Record<Side, PieceType | null>>({
    white: 'P',
    black: 'P',
  })
  const [isKingPlacementMode, setIsKingPlacementMode] = useState(false)
  const [finishConfirmSide, setFinishConfirmSide] = useState<Side | null>(null)
  const [menuConfirmOpen, setMenuConfirmOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('Loading saved game...')
  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(null)
  const [isCalculatingAutoplay, setIsCalculatingAutoplay] = useState(false)
  const [autoplayTransitionLatched, setAutoplayTransitionLatched] = useState(false)
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false)
  const [serverStats, setServerStats] = useState<StatsResponse | null>(null)
  const [readiness, setReadiness] = useState<ReadyResponse | null>(null)
  const [engineCheckLoading, setEngineCheckLoading] = useState(false)
  const [openRooms, setOpenRooms] = useState<OpenRoomSummary[]>([])
  const [openRoomsLoading, setOpenRoomsLoading] = useState(false)
  const [openRoomsError, setOpenRoomsError] = useState<string | null>(null)
  const [theme, setTheme] = useState<AppTheme>(() => getPreferredTheme())
  const [replayFinished, setReplayFinished] = useState(false)
  const actionInFlightRef = useRef(false)
  const gameRef = useRef<GameState | null>(null)
  const roomSessionRef = useRef<RoomSession | null>(null)
  const roomStateRef = useRef<RoomState | null>(null)
  const roomVersionRef = useRef<number>(0)
  const roomConnectedOnceRef = useRef(false)
  const syncRoomStateRef = useRef<(() => Promise<boolean>) | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const heartbeatIntervalRef = useRef<number | null>(null)
  const firstSnapshotTimeoutRef = useRef<number | null>(null)
  const pollingIntervalRef = useRef<number | null>(null)
  const inviteCopiedTimeoutRef = useRef<number | null>(null)
  const inviteRoomCodeRef = useRef<string | null>(null)
  const autoJoinAttemptedRef = useRef(false)
  const enginePreflightReady = readiness?.status === 'ready'

  useEffect(() => {
    gameRef.current = game
  }, [game])

  useEffect(() => {
    roomSessionRef.current = roomSession
  }, [roomSession])

  useEffect(() => {
    roomStateRef.current = roomState
    roomVersionRef.current = roomState?.version ?? 0
  }, [roomState])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const roomCode = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (roomCode) {
      const normalizedRoomCode = roomCode.slice(0, 6)
      inviteRoomCodeRef.current = normalizedRoomCode
      setGameSetupMode('multiplayer')
      setJoinRoomCode(normalizedRoomCode)
    }

    return () => {
      if (inviteCopiedTimeoutRef.current !== null) {
        window.clearTimeout(inviteCopiedTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const inviteRoomCode = inviteRoomCodeRef.current
    if (!inviteRoomCode || autoJoinAttemptedRef.current || loadingMessage || game || roomSession || !enginePreflightReady) {
      return
    }

    autoJoinAttemptedRef.current = true
    setGameSetupMode('multiplayer')
    setJoinRoomCode(inviteRoomCode)
    void handleJoinRoom(inviteRoomCode)
  }, [enginePreflightReady, game, loadingMessage, roomSession])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const initialState = await getInitialGame()

        if (!cancelled) {
          setGame(initialState.game)
          setRoomState(initialState.room)
          setRoomSession(initialState.roomSession)
          setRoomConnectionState(initialState.roomSession ? 'connecting' : 'disconnected')
          setErrorMessage(initialState.message)
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
    let cancelled = false
    let intervalId: number | null = null

    async function refreshStats() {
      try {
        const stats = await getStats()
        if (!cancelled) {
          setServerStats(stats)
        }
      } catch {
        if (!cancelled) {
          setServerStats(null)
        }
      }
    }

    void refreshStats()
    intervalId = window.setInterval(() => {
      void refreshStats()
    }, 8000)

    return () => {
      cancelled = true
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [])

  useEffect(() => {
    const handlePageHide = () => {
      const activeGame = gameRef.current
      if (!activeGame || activeGame.mode === 'multiplayer' || roomSessionRef.current) {
        return
      }

      abandonGameOnUnload(activeGame.game_id)
    }

    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])

  useEffect(() => {
    if (readiness?.status === 'ready') {
      return
    }

    let cancelled = false
    let intervalId: number | null = null

    async function refreshReadiness() {
      setEngineCheckLoading(true)
      try {
        const response = await warmupEngine()
        if (!cancelled) {
          setReadiness(response)
        }
      } catch {
        if (!cancelled) {
          setReadiness(null)
        }
      } finally {
        if (!cancelled) {
          setEngineCheckLoading(false)
        }
      }
    }

    void refreshReadiness()
    intervalId = window.setInterval(() => {
      void refreshReadiness()
    }, 8000)

    return () => {
      cancelled = true
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [readiness?.status])

  useEffect(() => {
    if (game) {
      return
    }

    let cancelled = false
    let intervalId: number | null = null

    async function refreshOpenRooms() {
      try {
        const rooms = await getOpenRooms()
        if (!cancelled) {
          setOpenRooms(rooms)
          setOpenRoomsError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setOpenRoomsError(getErrorMessage(error))
        }
      }
    }

    void refreshOpenRooms()
    intervalId = window.setInterval(() => {
      void refreshOpenRooms()
    }, 8000)

    return () => {
      cancelled = true
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [game])

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
    if (!game || game.phase !== 'setup' || game.mode === 'multiplayer') {
      return
    }

    if (game.mode === 'bot' && game.human_side !== game.setup_turn) {
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

    if (isAutoplayTerminal(game)) {
      setAutoplayTransitionLatched(false)
      return
    }

    if (shouldLatchCalculatingOverlay(game)) {
      setAutoplayTransitionLatched(true)
    }
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
    setRoomVisibility('private')
    setSelectedPiece('P')
    setSelectedPiecesBySide({
      white: 'P',
      black: 'P',
    })
    setIsKingPlacementMode(false)
    setFinishConfirmSide(null)
    setMenuConfirmOpen(false)
    setErrorMessage(message)
    setLoadingMessage('')
    setPendingActionLabel(null)
    setIsCalculatingAutoplay(false)
    setAutoplayTransitionLatched(false)
    setInviteLinkCopied(false)
    setOpenRoomsLoading(false)
    setOpenRoomsError(null)
    setReplayFinished(false)
  }

  useEffect(() => {
    if (!roomSession) {
      setRoomConnectionState('disconnected')
      roomConnectedOnceRef.current = false
      syncRoomStateRef.current = null
      return
    }

    let active = true
    let socket: WebSocket | null = null
    roomConnectedOnceRef.current = false
    setRoomConnectionState('connecting')

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
        resetToLauncher(formatRoomClosedMessage(`${formatSideLabel(getOpponentSide(roomSession.playerSide))} left. Room closed.`))
        return
      }

      if (isAutoplayTerminal(room.game)) {
        setAutoplayTransitionLatched(false)
      } else if (shouldLatchCalculatingOverlay(room.game)) {
        setAutoplayTransitionLatched(true)
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
          resetToLauncher(
            error instanceof ApiError && error.status === 404
              ? 'This room was closed or expired due to inactivity. Return to the main menu to start again.'
              : getErrorMessage(error),
          )
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
        roomConnectedOnceRef.current = true
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
          resetToLauncher(formatRoomClosedMessage(message.message))
        }
      }

      socket.onclose = (event) => {
        clearTimers()
        if (!active) {
          return
        }
        setRoomConnectionState(event.code === 4404 || (roomConnectedOnceRef.current && !navigator.onLine) ? 'disconnected' : 'connecting')
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

  useEffect(() => {
    if (!finishConfirmSide) {
      return
    }

    if (!game || game.phase !== 'setup') {
      setFinishConfirmSide(null)
      return
    }

    if (finishConfirmSide !== game.setup_turn || !isHumanSetupTurn || !getActivePlayerStatus(game).canFinishSetup) {
      setFinishConfirmSide(null)
    }
  }, [finishConfirmSide, game, isHumanSetupTurn])

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

  async function refreshOpenRooms() {
    if (game) {
      return
    }

    setOpenRoomsLoading(true)
    setOpenRoomsError(null)

    try {
      const rooms = await getOpenRooms()
      setOpenRooms(rooms)
    } catch (error) {
      setOpenRoomsError(getErrorMessage(error))
    } finally {
      setOpenRoomsLoading(false)
    }
  }

  async function backToMenu() {
    if (roomSession) {
      try {
        await leaveRoom(roomSession.roomCode, { player_token: roomSession.playerToken })
      } catch {
        // Best-effort cleanup for v1.
      }
    } else if (game) {
      try {
        await abandonGame(game.game_id)
      } catch {
        // Best-effort cleanup for local/solo games.
      }
    }

    resetToLauncher()
  }

  function requestBackToMenu() {
    if (!game || actionInFlightRef.current) {
      return
    }

    setMenuConfirmOpen(true)
  }

  async function confirmBackToMenu() {
    setMenuConfirmOpen(false)
    await backToMenu()
  }

  async function startNewGame(mode: GameMode = 'local', sideChoice: HumanSideChoice = 'white') {
    if (!enginePreflightReady) {
      setErrorMessage('Chess engine is still warming up. Start options unlock when the battle engine is ready.')
      return
    }

    const previousGameId = !roomSession ? game?.game_id : null

    actionInFlightRef.current = false
    setStoredRoomSession(null)
    setRoomState(null)
    setRoomSession(null)
    setRoomConnectionState('disconnected')
    window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY)
    setLoadingMessage(mode === 'bot' ? 'Starting singleplayer bot battle...' : 'Starting sandbox...')
    setPendingActionLabel(null)
    setErrorMessage(null)
    setIsKingPlacementMode(false)
    setFinishConfirmSide(null)
    setMenuConfirmOpen(false)
    setSelectedPiece('P')
    setSelectedPiecesBySide({
      white: 'P',
      black: 'P',
    })
    setIsCalculatingAutoplay(false)
    setAutoplayTransitionLatched(false)
    setInviteLinkCopied(false)
    setReplayFinished(false)

    try {
      if (previousGameId) {
        try {
          await abandonGame(previousGameId)
        } catch {
          // Best-effort cleanup; a missing old game should not block the new one.
        }
      }

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
    if (!enginePreflightReady) {
      setErrorMessage('Chess engine is still warming up. Room creation unlocks when the battle engine is ready.')
      return
    }

    actionInFlightRef.current = false
    window.sessionStorage.removeItem(SESSION_STORAGE_GAME_KEY)
    setLoadingMessage('Creating room...')
    setPendingActionLabel(null)
    setErrorMessage(null)
    setIsKingPlacementMode(false)
    setFinishConfirmSide(null)
    setMenuConfirmOpen(false)
    setSelectedPiece('P')
    setSelectedPiecesBySide({
      white: 'P',
      black: 'P',
    })
    setIsCalculatingAutoplay(false)
    setAutoplayTransitionLatched(false)
    setInviteLinkCopied(false)
    setReplayFinished(false)

    try {
      const response = await createRoom({ visibility: roomVisibility })
      const session: RoomSession = {
        roomCode: response.room.room_code,
        playerToken: response.player_token,
        playerSide: response.player_side,
      }
      setStoredRoomSession(session)
      window.sessionStorage.removeItem(SESSION_STORAGE_GAME_KEY)
      setRoomConnectionState('connecting')
      setRoomSession(session)
      setRoomState(response.room)
      setGame(response.room.game)
      setLoadingMessage('')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      setLoadingMessage('')
    }
  }

  async function handleJoinRoom(roomCodeOverride?: string) {
    if (!enginePreflightReady) {
      setErrorMessage('Chess engine is still warming up. Joining unlocks when the battle engine is ready.')
      return
    }

    const normalizedRoomCode = (roomCodeOverride ?? joinRoomCode).trim().toUpperCase()
    if (!normalizedRoomCode) {
      setErrorMessage('Enter a room code.')
      return
    }
    setJoinRoomCode(normalizedRoomCode)

    actionInFlightRef.current = false
    window.sessionStorage.removeItem(SESSION_STORAGE_GAME_KEY)
    setLoadingMessage(`Joining ${normalizedRoomCode}...`)
    setPendingActionLabel(null)
    setErrorMessage(null)
    setIsKingPlacementMode(false)
    setFinishConfirmSide(null)
    setMenuConfirmOpen(false)
    setSelectedPiece('P')
    setSelectedPiecesBySide({
      white: 'P',
      black: 'P',
    })
    setIsCalculatingAutoplay(false)
    setAutoplayTransitionLatched(false)
    setInviteLinkCopied(false)
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
      setRoomConnectionState('connecting')
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

    const previousGameId = game?.game_id ?? null

    actionInFlightRef.current = false
    setLoadingMessage('Loading sample...')
    setPendingActionLabel('Loading sample...')
    setErrorMessage(null)
    setIsKingPlacementMode(false)
    setFinishConfirmSide(null)
    setMenuConfirmOpen(false)
    setSelectedPiece('P')
    setSelectedPiecesBySide({
      white: 'P',
      black: 'P',
    })
    setIsCalculatingAutoplay(false)
    setAutoplayTransitionLatched(false)
    setInviteLinkCopied(false)
    setReplayFinished(false)

    try {
      if (previousGameId) {
        try {
          await abandonGame(previousGameId)
        } catch {
          // Best-effort cleanup; a missing old game should not block the sample.
        }
      }

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

  async function refetchLatestGameStateAfterAction(): Promise<GameState | null> {
    if (!game) {
      return null
    }

    if (isMultiplayer && roomSession && roomState) {
      try {
        const response = await getRoom(roomSession.roomCode, roomSession.playerToken)
        setRoomState(response.room)
        setGame(response.room.game)
        return response.room.game
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          resetToLauncher('This room was closed or expired due to inactivity. Return to the main menu to start again.')
          return null
        }

        throw error
      }
    }

    try {
      const response = await getGame(game.game_id)
      setGame(response.game)
      return response.game
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        resetToLauncher('Saved game expired after a server restart or idle cleanup. Start a new battle from the menu.')
        return null
      }

      throw error
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
    const pendingLabel = isBotGame ? `${label} Waiting for bot...` : label
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
        if (payload.action_type === 'place_king') {
          await refetchLatestGameStateAfterAction()
        }
      }
      setIsKingPlacementMode(false)
    } catch (error) {
      const actionError = getErrorMessage(error)
      try {
        const latest = await refetchLatestGameStateAfterAction()
        if (latest && shouldLatchCalculatingOverlay(latest)) {
          setAutoplayTransitionLatched(true)
        } else if (latest && isAutoplayTerminal(latest)) {
          setAutoplayTransitionLatched(false)
        } else {
          setAutoplayTransitionLatched(false)
          setErrorMessage(actionError)
        }
      } catch (refreshError) {
        setAutoplayTransitionLatched(false)
        setErrorMessage(`${actionError} Refresh failed: ${getErrorMessage(refreshError)}`)
      }
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

    const activeStatus = getActivePlayerStatus(game)
    const currentLegalTargets = getLegalPlacementSquares(
      game,
      selectedPiece,
      isKingPlacementMode,
      activeStatus.canPlaceKing,
      true,
    )

    if (isKingPlacementMode) {
      if (!currentLegalTargets.includes(square)) {
        setErrorMessage('Choose a highlighted king square.')
        return
      }

      await submitAction(
        {
          action_type: 'place_king',
          side: game.setup_turn,
          square,
        },
        `Placing king on ${square}...`,
      )
      return
    }

    if (!selectedPiece) {
      setErrorMessage(activeStatus.canPlaceKing ? 'Select King, then choose a highlighted square.' : 'Select an available piece first.')
      return
    }

    if (!currentLegalTargets.includes(square)) {
      setErrorMessage(
        currentLegalTargets.length > 0
          ? 'Choose a highlighted legal square.'
          : activeStatus.canPlaceKing
            ? 'Select King, then choose a highlighted square.'
            : 'Select an available piece with legal placement squares first.',
      )
      return
    }

    await submitAction(
      {
        action_type: 'place_piece',
        side: game.setup_turn,
        piece_type: selectedPiece,
        square,
      },
      `Placing ${selectedPiece} on ${square}...`,
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
      if (game.mode !== 'multiplayer') {
        setSelectedPiecesBySide((current) => ({
          ...current,
          [game.setup_turn]: piece,
        }))
      }
      setIsKingPlacementMode(false)
    }

    setErrorMessage(null)
  }

  function handleFinishSetupRequest() {
    if (!game || actionInFlightRef.current || pendingActionLabel || !isHumanSetupTurn) {
      return
    }

    if (!getActivePlayerStatus(game).canFinishSetup) {
      return
    }

    setFinishConfirmSide(game.setup_turn)
  }

  async function confirmFinishSetup() {
    if (!game || !finishConfirmSide || actionInFlightRef.current || !isHumanSetupTurn) {
      return
    }

    if (finishConfirmSide !== game.setup_turn || !getActivePlayerStatus(game).canFinishSetup) {
      setFinishConfirmSide(null)
      return
    }

    setFinishConfirmSide(null)
    await submitAction(
      {
        action_type: 'finish_setup',
        side: game.setup_turn,
      },
      `Locking ${formatSideLabel(game.setup_turn)} setup...`,
    )
  }

  async function writeTextToClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }

    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.setAttribute('readonly', '')
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.append(textArea)
    textArea.select()
    const copied = document.execCommand('copy')
    textArea.remove()

    if (!copied) {
      throw new Error('Clipboard copy failed.')
    }
  }

  async function handleCopyInviteLink() {
    if (!roomState?.room_code) {
      return
    }

    const inviteUrl = new URL(window.location.href)
    inviteUrl.search = ''
    inviteUrl.hash = ''
    inviteUrl.searchParams.set('room', roomState.room_code)

    try {
      await writeTextToClipboard(inviteUrl.toString())
      setInviteLinkCopied(true)
      if (inviteCopiedTimeoutRef.current !== null) {
        window.clearTimeout(inviteCopiedTimeoutRef.current)
      }
      inviteCopiedTimeoutRef.current = window.setTimeout(() => {
        setInviteLinkCopied(false)
      }, 1800)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
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
  const liveStatusPill = serverStats
    ? `Live now: ${serverStats.active_games} game${serverStats.active_games === 1 ? '' : 's'} · ${serverStats.active_players} player${serverStats.active_players === 1 ? '' : 's'}`
    : undefined
  const totalBattlesPill = serverStats ? `Total battles played: ${serverStats.total_battles_played}` : undefined
  const hasLiveActivity = Boolean(serverStats && (serverStats.active_games > 0 || serverStats.active_players > 0))
  const activityPillClassName = `activity-pill${hasLiveActivity ? ' activity-pill-live' : ''}`
  const activityTone: HeaderTone = hasLiveActivity ? 'connected' : 'disconnected'
  const engineStatusPill =
    readiness?.status === 'ready'
      ? 'Chess engine active'
      : readiness?.status === 'degraded'
        ? 'Chess engine unavailable'
        : engineCheckLoading
          ? 'Chess engine warming up...'
          : 'Chess engine warming up...'
  const engineStatusTone: HeaderTone =
    readiness?.status === 'ready'
      ? 'connected'
      : readiness?.status === 'degraded'
        ? 'disconnected'
        : 'connecting'

  if (!game) {
    const isBootstrapping = Boolean(loadingMessage)
    const roomVisibilityDescription =
      roomVisibility === 'public'
        ? 'Visible in Open Games until someone joins.'
        : 'Join by code or invite link only.'
    const showOpenGames = gameSetupMode === 'multiplayer' || openRooms.length > 0 || Boolean(openRoomsError)

    return (
      <div className="shell loading-shell">
        <AppHeader
          primaryPill={engineStatusPill}
          primaryPillClassName="system-pill"
          primaryTone={engineStatusTone}
          secondaryPill={liveStatusPill}
          secondaryPillClassName={activityPillClassName}
          secondaryTone={activityTone}
          tertiaryPill={totalBattlesPill}
          tertiaryPillClassName="activity-pill total-battles-pill"
          tertiaryTone="setup"
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
            </div>

            <section className="launcher-tutorial">
              <div className="launcher-tutorial-heading">
                <p className="eyebrow">Quick Start</p>
                  <strong>Three-step battle plan</strong>
              </div>
              <div className="launcher-step-grid">
                <article className="launcher-step-card">
                  <span>1</span>
                  <strong>Choose a mode</strong>
                  <p>Play locally with a friend, play singleplayer vs bot, or create an online multiplayer room.</p>
                </article>
                <article className="launcher-step-card">
                  <span>2</span>
                  <strong>Build your formation</strong>
                  <p>Spend your points to buy pieces, place them where you want, then place your king last to start the fight.</p>
                </article>
                <article className="launcher-step-card">
                  <span>3</span>
                  <strong>Watch the battle unfold</strong>
                  <p>A grandmaster-level chess engine simulates the outcome. May the best setup win.</p>
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
                      Singleplayer vs Bot
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
                  <>
                    <div className="launcher-group">
                      <span className="launcher-label">Room Visibility</span>
                      <div className="launcher-choice-row">
                        <button
                          type="button"
                          className={`choice-pill ${roomVisibility === 'private' ? 'selected' : ''}`}
                          onClick={() => setRoomVisibility('private')}
                        >
                          Private
                        </button>
                        <button
                          type="button"
                          className={`choice-pill ${roomVisibility === 'public' ? 'selected' : ''}`}
                          onClick={() => setRoomVisibility('public')}
                        >
                          Public
                        </button>
                      </div>
                      <p className="launcher-support-copy">{roomVisibilityDescription}</p>
                    </div>

                    <div className="launcher-group">
                      <span className="launcher-label">Room Access</span>
                      <div className="launcher-choice-row multiplayer-room-row">
                        <button
                          type="button"
                          className="button primary compact-action"
                          disabled={!enginePreflightReady}
                          onClick={() => {
                            void handleCreateRoom()
                          }}
                        >
                          Create {roomVisibility === 'public' ? 'Public' : 'Private'} Room
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
                          disabled={!enginePreflightReady}
                          onClick={() => {
                            void handleJoinRoom()
                          }}
                        >
                          Join Room
                        </button>
                      </div>
                    </div>

                  </>
                ) : null}

                {gameSetupMode !== 'multiplayer' ? (
                  <button
                    type="button"
                    className="button primary launcher-start-button"
                    disabled={!enginePreflightReady}
                    onClick={() => {
                      void startNewGame(gameSetupMode, humanSideChoice)
                    }}
                  >
                    Start {formatModeLabel(gameSetupMode)}
                  </button>
                ) : null}

                {showOpenGames ? (
                  <section className="launcher-group open-games-panel">
                    <div className="open-games-heading">
                      <div>
                        <span className="launcher-label">Open Games</span>
                        <p className="launcher-support-copy">Public rooms waiting for a second player.</p>
                      </div>
                      <button
                        type="button"
                        className="button ghost small open-games-refresh"
                        onClick={() => {
                          void refreshOpenRooms()
                        }}
                        disabled={openRoomsLoading}
                      >
                        {openRoomsLoading ? 'Refreshing...' : 'Refresh'}
                      </button>
                    </div>

                    {openRoomsError ? <p className="error-message open-games-message">{openRoomsError}</p> : null}

                    {openRooms.length === 0 && !openRoomsError ? (
                      <p className="open-games-empty">No open games right now. Create one or invite a friend.</p>
                    ) : null}

                    {openRooms.length > 0 ? (
                      <div className="open-game-list">
                        {openRooms.map((openRoom) => (
                          <article className="open-game-card" key={openRoom.room_code}>
                            <div className="open-game-copy">
                              <strong>Room {openRoom.room_code}</strong>
                              <span>
                                {openRoom.white_connected ? 'Host online' : 'Host waiting'} · {formatSideLabel(openRoom.setup_turn)} to place
                              </span>
                            </div>
                            <button
                              type="button"
                              className="button primary small open-game-join"
                              disabled={!enginePreflightReady}
                              onClick={() => {
                                void handleJoinRoom(openRoom.room_code)
                              }}
                            >
                              Join
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            )}

            {errorMessage ? (
              <>
                <p className="error-message">{errorMessage}</p>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => {
                    if (isClosedRoomMessage(errorMessage)) {
                      resetToLauncher()
                      return
                    }
                    window.location.reload()
                  }}
                >
                  {isClosedRoomMessage(errorMessage) ? 'Back to menu' : 'Try reconnecting'}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  const isSetupActive = game.phase === 'setup'
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
  const canActOnSetup =
    isSetupActive &&
    pendingActionLabel === null &&
    isHumanSetupTurn &&
    (!isMultiplayer || roomState?.status === 'active')
  const legalTargetSquares = getLegalPlacementSquares(
    game,
    selectedPiece,
    isKingPlacementMode,
    activePlayerStatus.canPlaceKing,
    canActOnSetup,
  )
  const readyForAutoplay = game.autoplay.status === 'pending' || game.phase === 'ready_for_autoplay'
  const autoplayReady = game.phase === 'autoplay' && game.autoplay.status === 'ready' && !!game.autoplay.initial_fen
  const autoplayPhase = game.phase === 'autoplay'
  const sharedCalculatingState = shouldLatchCalculatingOverlay(game)
  const showCalculatingOverlay =
    !isAutoplayTerminal(game) &&
    (
      autoplayTransitionLatched ||
      (isMultiplayer ? sharedCalculatingState : isCalculatingAutoplay || sharedCalculatingState)
    )
  const headerTone = getHeaderTone(game)
  const roomConnectionPill = isMultiplayer && roomState
    ? `Room ${roomState.room_code} · ${roomConnectionState}`
    : undefined
  const roomConnectionTone = getRoomConnectionTone(roomConnectionState)
  const humanSideLabel = isMultiplayer
    ? multiplayerSideLabel
    : game.human_side
      ? game.human_side[0].toUpperCase() + game.human_side.slice(1)
      : null
  const shopPreviewSide: Side = isMultiplayer && roomSession
    ? roomSession.playerSide
    : isBotGame && game.human_side
      ? game.human_side
      : game.setup_turn
  const activeSideLabel = formatSideLabel(game.setup_turn)
  const selectedSetupPieceLabel = isKingPlacementMode
    ? 'King'
    : selectedPiece && legalTargetSquares.length > 0
      ? PIECE_LABELS[selectedPiece]
      : null
  const boardHeading = multiplayerWaiting
    ? 'Waiting for opponent'
    : isMultiplayer && !isHumanSetupTurn
      ? `Opponent placing ${activeSideLabel}`
      : isBotGame && !isHumanSetupTurn
        ? `Bot placing ${activeSideLabel}`
        : selectedSetupPieceLabel
          ? `${activeSideLabel} placing ${selectedSetupPieceLabel}`
          : isMultiplayer
            ? `Your turn: place ${activeSideLabel}`
            : `${activeSideLabel} to move`
  const boardEyebrow = multiplayerWaiting
    ? 'Room Setup'
    : isMultiplayer && !isHumanSetupTurn
      ? 'Opponent Turn'
      : 'Setup Turn'
  const menuConfirmationModal = menuConfirmOpen ? (
    <ConfirmationModal
      eyebrow="Leave game"
      title="Back to menu?"
      message={
        isMultiplayer
          ? 'This leaves the room and closes the match for both players.'
          : 'This returns to the menu and clears the current game from this browser session.'
      }
      confirmLabel="Back to menu"
      confirmTone="danger"
      disabled={pendingActionLabel !== null || actionInFlightRef.current}
      onCancel={() => setMenuConfirmOpen(false)}
      onConfirm={() => {
        void confirmBackToMenu()
      }}
    />
  ) : null

  if (autoplayReady) {
    return (
      <div className="shell">
        <AppHeader
          primaryPill={engineStatusPill}
          primaryPillClassName="system-pill"
          primaryTone={engineStatusTone}
          secondaryPill={liveStatusPill}
          secondaryPillClassName={activityPillClassName}
          secondaryTone={activityTone}
          tertiaryPill={roomConnectionPill}
          tertiaryPillClassName="room-pill"
          tertiaryTone={roomConnectionTone}
          tone={replayFinished ? 'complete' : 'autoplay'}
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          onBackToMenu={requestBackToMenu}
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
          onBackToMenu={requestBackToMenu}
          outcomeKnown={replayFinished}
          onOutcomeReveal={() => setReplayFinished(true)}
        />
        {menuConfirmationModal}
      </div>
    )
  }

  if (showCalculatingOverlay) {
    return (
      <div className="shell">
        <AppHeader
          primaryPill={engineStatusPill}
          primaryPillClassName="system-pill"
          primaryTone={engineStatusTone}
          secondaryPill={liveStatusPill}
          secondaryPillClassName={activityPillClassName}
          secondaryTone={activityTone}
          tertiaryPill={roomConnectionPill}
          tertiaryPillClassName="room-pill"
          tertiaryTone={roomConnectionTone}
          tone="autoplay"
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          onBackToMenu={requestBackToMenu}
        />

        <main className="layout">
          <section className="board-column">
            <div className="board-stage">
              <div className="stage-heading">
                <div>
                  <p className="eyebrow">Battle Engine</p>
                  <h2>Calculating battle...</h2>
                </div>
              </div>

              <section className="panel board-panel premium-card compact-board-panel">
                <div className="board-overlay-shell">
                  <Board
                    activeSide={game.setup_turn}
                    interactive={false}
                    disabledAppearance={false}
                    selectedSquare={null}
                    selectedModeLabel="Final battle setup"
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
                        <p className="eyebrow">Engine is preparing</p>
                        <h3>Calculating battle...</h3>
                        <p>The setup is locked. Stockfish is generating the shared battle simulation.</p>
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
                <strong>Generating battle simulation</strong>
                <span className="status-chip tone-autoplay">Working</span>
              </div>

              <div className="status-metrics">
                <div className="metric-card emphasis">
                  <span>Phase</span>
                  <strong>Battle</strong>
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
        {menuConfirmationModal}
      </div>
    )
  }

  if (autoplayPhase) {
    const autoplayHeadline =
      game.autoplay.status === 'failed'
        ? 'Battle generation failed'
        : game.autoplay.status === 'running'
          ? 'Generating battle simulation'
          : 'Battle simulation pending'
    const autoplayMessage =
      game.autoplay.error ??
      (game.autoplay.status === 'running'
        ? 'Stockfish is simulating the battle from the finished setup.'
        : 'The setup is locked. Battle data is not ready yet.')

    return (
      <div className="shell">
        <AppHeader
          primaryPill={engineStatusPill}
          primaryPillClassName="system-pill"
          primaryTone={engineStatusTone}
          secondaryPill={liveStatusPill}
          secondaryPillClassName={activityPillClassName}
          secondaryTone={activityTone}
          tertiaryPill={roomConnectionPill}
          tertiaryPillClassName="room-pill"
          tertiaryTone={roomConnectionTone}
          tone="autoplay"
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          onBackToMenu={requestBackToMenu}
        />

        <main className="layout">
          <section className="board-column">
            <div className="board-stage">
              <div className="stage-heading">
                <div>
                  <p className="eyebrow">Battle Status</p>
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
                        Refresh battle state
                      </button>
                      {game.autoplay.status === 'failed' ? (
                        <button
                          type="button"
                          className="button ghost"
                          onClick={requestBackToMenu}
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
        {menuConfirmationModal}
      </div>
    )
  }

  return (
    <div className="shell">
      <AppHeader
        primaryPill={engineStatusPill}
        primaryPillClassName="system-pill"
        primaryTone={engineStatusTone}
        secondaryPill={liveStatusPill}
        secondaryPillClassName={activityPillClassName}
        secondaryTone={activityTone}
        tertiaryPill={roomConnectionPill}
        tertiaryPillClassName="room-pill"
        tertiaryTone={roomConnectionTone}
        tone={headerTone}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        onBackToMenu={requestBackToMenu}
      />

      <main className="layout">
        <section className="board-column">
          <div className="board-stage">
            <div className="stage-heading">
              <div>
                <p className="eyebrow">{boardEyebrow}</p>
                <h2>{boardHeading}</h2>
              </div>
            </div>

            {readyForAutoplay ? (
              <section className="panel premium-card transition-card">
                <div>
                  <p className="eyebrow">Next Stage</p>
                  <h3>Battle ready</h3>
                  <p>Both kings are placed. Stockfish will resolve this position into a battle simulation.</p>
                </div>
              </section>
            ) : null}

            <section className="panel board-panel premium-card">
              <Board
                activeSide={game.setup_turn}
                interactive={canActOnSetup}
                legalTargetSquares={legalTargetSquares}
                selectedSquare={null}
                selectedModeLabel={boardHeading}
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
          sharedRequirementReason={activePlayerStatus.sharedRequirementReason}
          isBotGame={isBotGame}
          humanSideLabel={humanSideLabel}
          shopPreviewSide={shopPreviewSide}
          isHumanSetupTurn={isHumanSetupTurn}
          onSelectPiece={handleSelectPiece}
          onFinishSetup={() => {
            handleFinishSetupRequest()
          }}
          onCopyInviteLink={() => {
            void handleCopyInviteLink()
          }}
          onRefresh={() => {
            void refreshGame()
          }}
          onLoadSample={() => {
            void loadSampleGame()
          }}
          onDownloadLog={handleDownloadLog}
          inviteCopied={inviteLinkCopied}
          statusTone={headerTone}
        />
      </main>

      {finishConfirmSide ? (
        <ConfirmationModal
          eyebrow="Confirm setup"
          title={`Finish setup for ${formatSideLabel(finishConfirmSide)}?`}
          message={`This locks ${formatSideLabel(finishConfirmSide).toLowerCase()}'s budget with ${game[finishConfirmSide].points_remaining} point${game[finishConfirmSide].points_remaining === 1 ? '' : 's'} left. King placement comes next.`}
          confirmLabel="Finish setup"
          disabled={pendingActionLabel !== null || actionInFlightRef.current}
          onCancel={() => setFinishConfirmSide(null)}
          onConfirm={() => {
            void confirmFinishSetup()
          }}
        />
      ) : null}
      {menuConfirmationModal}
    </div>
  )
}
