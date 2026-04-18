const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000'

export type Side = 'white' | 'black'
export type GameMode = 'local' | 'bot' | 'multiplayer'
export type HumanSideChoice = 'white' | 'black' | 'random'
export type Phase = 'setup' | 'ready_for_autoplay' | 'autoplay' | 'results'
export type ActionType = 'place_piece' | 'finish_setup' | 'place_king'
export type PieceType = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K'
export type AutoplayStatus = 'not_ready' | 'running' | 'ready' | 'failed'
export type RoomStatus = 'waiting' | 'active' | 'complete'

export interface PlacedPiece {
  type: PieceType
  square: string
}

export interface PlayerSetupState {
  side: Side
  points_remaining: number
  finished_spending: boolean
  pieces: PlacedPiece[]
  king_square: string | null
}

export interface GameRules {
  id: string
  budget: number
  mandatory_pawns: number
  costs: Record<PieceType, number>
  pawn_ranks: Record<Side, number[]>
  non_king_ranks: Record<Side, number[]>
  king_ranks: Record<Side, number[]>
  white_moves_first: boolean
  castling_enabled: boolean
}

export interface GameState {
  game_id: string
  mode: GameMode
  human_side: Side | null
  bot_side: Side | null
  phase: Phase
  setup_turn: Side
  white: PlayerSetupState
  black: PlayerSetupState
  rules: GameRules
  event_log: string[]
  result: string | null
  autoplay: AutoplayState
}

export interface ReplayMove {
  ply: number
  uci: string
  san: string
  fen_after: string
}

export interface AutoplayState {
  status: AutoplayStatus
  initial_fen: string | null
  moves: ReplayMove[]
  final_fen: string | null
  result: string | null
  error: string | null
}

export interface ApiResponse {
  ok: boolean
  message: string | null
  game: GameState
}

export interface RoomPlayerState {
  side: Side
  player_token: string
  connected: boolean
}

export interface RoomState {
  room_code: string
  status: RoomStatus
  game: GameState
  white_player: RoomPlayerState
  black_player: RoomPlayerState | null
}

export interface RoomResponse {
  ok: boolean
  message: string | null
  room: RoomState
  player_token: string
  player_side: Side
}

export interface RoomEvent {
  type: 'snapshot' | 'room_closed'
  room?: RoomState | null
  room_code?: string | null
  message?: string | null
}

export interface CreateSoloGameRequest {
  white_name?: string
  black_name?: string
  mode?: GameMode
  human_side?: HumanSideChoice
}

export interface CreateSampleGameRequest {
  preset_id?: string
  mode?: GameMode
  human_side?: HumanSideChoice
}

export interface CreateRoomRequest {
  white_name?: string
  black_name?: string
}

export interface JoinRoomRequest {
  room_code: string
}

export interface LeaveRoomRequest {
  player_token: string
}

export interface ActionRequest {
  action_type: ActionType
  side: Side
  piece_type?: PieceType
  square?: string
}

export interface RoomActionRequest {
  player_token: string
  action: ActionRequest
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? DEFAULT_API_BASE_URL

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`

    try {
      const data = (await response.json()) as { detail?: unknown }
      message = formatErrorDetail(data.detail, message)
    } catch {
      const text = await response.text()
      if (text) {
        message = text
      }
    }

    throw new ApiError(message, response.status)
  }

  return response.json() as Promise<T>
}

function formatErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  if (Array.isArray(detail)) {
    const joined = detail
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string') {
          return item.msg
        }

        return ''
      })
      .filter(Boolean)
      .join(', ')

    if (joined) {
      return joined
    }
  }

  return fallback
}

export function createSoloGame(payload: CreateSoloGameRequest = {}): Promise<ApiResponse> {
  return request<ApiResponse>('/games/solo', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createSampleGame(payload: CreateSampleGameRequest = {}): Promise<ApiResponse> {
  return request<ApiResponse>('/games/sample', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getGame(gameId: string): Promise<ApiResponse> {
  return request<ApiResponse>(`/games/${gameId}`)
}

export function applyAction(gameId: string, payload: ActionRequest): Promise<ApiResponse> {
  return request<ApiResponse>(`/games/${gameId}/actions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createRoom(payload: CreateRoomRequest = {}): Promise<RoomResponse> {
  return request<RoomResponse>('/rooms', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function joinRoom(payload: JoinRoomRequest): Promise<RoomResponse> {
  return request<RoomResponse>('/rooms/join', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getRoom(roomCode: string, playerToken: string): Promise<RoomResponse> {
  const search = new URLSearchParams({ player_token: playerToken })
  return request<RoomResponse>(`/rooms/${roomCode}?${search.toString()}`)
}

export function applyRoomAction(roomCode: string, payload: RoomActionRequest): Promise<RoomResponse> {
  return request<RoomResponse>(`/rooms/${roomCode}/actions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function leaveRoom(roomCode: string, payload: LeaveRoomRequest): Promise<{ status: string }> {
  return request<{ status: string }>(`/rooms/${roomCode}/leave`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getApiBaseUrl(): string {
  return apiBaseUrl
}

export function getWebSocketUrl(path: string): string {
  const url = new URL(path, apiBaseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
