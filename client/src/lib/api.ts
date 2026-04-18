const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000'

export type Side = 'white' | 'black'
export type Phase = 'setup' | 'ready_for_autoplay' | 'autoplay' | 'results'
export type ActionType = 'place_piece' | 'finish_setup' | 'place_king'
export type PieceType = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K'
export type AutoplayStatus = 'not_ready' | 'running' | 'ready' | 'failed'

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

export interface CreateSoloGameRequest {
  white_name?: string
  black_name?: string
}

export interface ActionRequest {
  action_type: ActionType
  side: Side
  piece_type?: PieceType
  square?: string
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

export function getGame(gameId: string): Promise<ApiResponse> {
  return request<ApiResponse>(`/games/${gameId}`)
}

export function applyAction(gameId: string, payload: ActionRequest): Promise<ApiResponse> {
  return request<ApiResponse>(`/games/${gameId}/actions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getApiBaseUrl(): string {
  return apiBaseUrl
}
