import type { GameState, PieceType, Side } from '../lib/api'
import { PieceGlyph } from './PieceGlyph'

const PIECE_LABELS: Record<PieceType, string> = {
  P: 'Pawn',
  N: 'Knight',
  B: 'Bishop',
  R: 'Rook',
  Q: 'Queen',
  K: 'King',
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const

interface SidebarProps {
  game: GameState
  selectedPiece: PieceType | null
  selectedPieceLabel: string
  isKingPlacementMode: boolean
  isSetupActive: boolean
  errorMessage: string | null
  blockingMessage: string | null
  pendingActionLabel: string | null
  canFinishSetup: boolean
  canPlaceKing: boolean
  finishSetupReason: string | null
  kingPlacementReason: string | null
  onSelectPiece: (piece: PieceType) => void
  onFinishSetup: () => void
  onRefresh: () => void
  statusTone: 'setup' | 'autoplay' | 'complete'
}

function formatSide(side: Side): string {
  return side[0].toUpperCase() + side.slice(1)
}

function formatPhase(phase: GameState['phase']): string {
  return phase
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
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

function canPlacePieceTypeNow(game: GameState, piece: PieceType): boolean {
  if (game.phase !== 'setup') {
    return false
  }

  if (piece === 'K') {
    const player = game[game.setup_turn]
    const pawnsPlaced = player.pieces.filter((placed) => placed.type === 'P').length
    const hasMinimumPawns = pawnsPlaced >= game.rules.mandatory_pawns
    const spendingComplete = player.finished_spending || player.points_remaining === 0
    return !player.king_square && hasMinimumPawns && spendingComplete
  }

  const player = game[game.setup_turn]
  if (player.finished_spending) {
    return false
  }

  const cost = game.rules.costs[piece]
  if (cost > player.points_remaining) {
    return false
  }

  const candidateRanks = piece === 'P' ? game.rules.pawn_ranks[game.setup_turn] : game.rules.non_king_ranks[game.setup_turn]
  const occupiedSquares = getOccupiedSquares(game)
  const legalSquares = getSquaresForRanks(candidateRanks).filter((square) => !occupiedSquares.has(square))

  if (legalSquares.length === 0) {
    return false
  }

  return legalSquares.some((square) =>
    canKeepPawnPathViable(game, game.setup_turn, piece, square, occupiedSquares),
  )
}

export function Sidebar({
  game,
  selectedPiece,
  selectedPieceLabel,
  isKingPlacementMode,
  isSetupActive,
  errorMessage,
  blockingMessage,
  pendingActionLabel,
  canFinishSetup,
  canPlaceKing,
  finishSetupReason,
  kingPlacementReason,
  onSelectPiece,
  onFinishSetup,
  onRefresh,
  statusTone,
}: SidebarProps) {
  const activePlayer = game[game.setup_turn]
  const canInteract = isSetupActive && pendingActionLabel === null
  const activeSideLabel = formatSide(game.setup_turn)
  const isLivePhase = isSetupActive
  const pieceOptions = (['P', 'N', 'B', 'R', 'Q', 'K'] as PieceType[]).map((piece) => ({
    piece,
    label: PIECE_LABELS[piece],
    cost: game.rules.costs[piece],
    enabled: canPlacePieceTypeNow(game, piece),
  }))

  return (
    <aside className="sidebar">
      <section className="panel status-panel premium-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Current Status</p>
            <h2 className="status-title">{formatPhase(game.phase)}</h2>
          </div>
          <button type="button" className="button ghost small" onClick={onRefresh} disabled={pendingActionLabel !== null}>
            Refresh
          </button>
        </div>

        <div className="status-line">
          <span className={`live-dot tone-${statusTone} ${isLivePhase ? 'on' : ''}`} />
          <strong>{isSetupActive ? `${activeSideLabel} to move` : 'Setup interactions disabled'}</strong>
          <span className={`status-chip tone-${statusTone}`}>{isLivePhase ? 'Live phase' : 'Locked'}</span>
        </div>

        <div className="status-metrics">
          <div className="metric-card emphasis">
            <span>Selected</span>
            <strong>{selectedPieceLabel}</strong>
          </div>
          <div className="metric-card">
            <span>White points</span>
            <strong>{game.white.points_remaining}</strong>
          </div>
          <div className="metric-card">
            <span>Black points</span>
            <strong>{game.black.points_remaining}</strong>
          </div>
          <div className="metric-card">
            <span>Game ID</span>
            <strong>{game.game_id}</strong>
          </div>
        </div>
      </section>

      <section className="panel premium-card">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Piece Shop</p>
            <h2>Choose Formation</h2>
          </div>
        </div>
        <p className="panel-copy">Select a piece, then click a square on the board. Shop previews currently show the {activeSideLabel.toLowerCase()} side.</p>
        <div className="shop-preview-badge">
          <span className="shop-preview-dot" />
          Previewing {activeSideLabel}
        </div>
        <div className="piece-grid">
          {pieceOptions.map(({ piece, label, cost, enabled }) => {
            const isKingTile = piece === 'K'
            const isSelected = isKingTile ? isKingPlacementMode : selectedPiece === piece && !isKingPlacementMode
            const isLocked = !enabled

            return (
            <button
              key={piece}
              type="button"
              className={`piece-button ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
              onClick={() => onSelectPiece(piece)}
              disabled={isLocked}
            >
              <span className="piece-button-icon">
                <PieceGlyph piece={piece} side={game.setup_turn} tone="shop" className="shop-piece" />
              </span>
              <span className="piece-button-copy">
                <strong>{label}</strong>
                <span>
                  {isKingTile
                    ? enabled
                      ? 'Ready'
                      : 'Locked'
                    : enabled
                      ? `${cost} pts`
                      : 'Unavailable'}
                </span>
              </span>
              {isLocked ? <span className="piece-lock-badge">{isKingTile ? 'Locked' : 'Unavailable'}</span> : null}
            </button>
            )
          })}
        </div>
      </section>

      <section className="panel premium-card">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Turn Requirements</p>
            <h2>Validation</h2>
          </div>
        </div>

        {isSetupActive ? (
          <>
            <div className="requirement-list">
              <div className="requirement-row">
                <span>Mandatory pawns</span>
                <strong>{activePlayer.pieces.filter((piece) => piece.type === 'P').length}/{game.rules.mandatory_pawns}</strong>
              </div>
              <div className="requirement-row">
                <span>Finish setup allowed</span>
                <strong className={canFinishSetup ? 'ok' : 'blocked'}>{canFinishSetup ? 'Yes' : 'No'}</strong>
              </div>
              <div className="requirement-row">
                <span>King placement allowed</span>
                <strong className={canPlaceKing ? 'ok' : 'blocked'}>{canPlaceKing ? 'Yes' : 'No'}</strong>
              </div>
              <div className="requirement-row">
                <span>Spending finished</span>
                <strong className={activePlayer.finished_spending ? 'ok' : 'blocked'}>{activePlayer.finished_spending ? 'Yes' : 'No'}</strong>
              </div>
              <div className="requirement-row">
                <span>King placed</span>
                <strong>{activePlayer.king_square ?? 'Not yet'}</strong>
              </div>
            </div>

            {kingPlacementReason ? <p className="hint-message">{kingPlacementReason}</p> : null}
            {finishSetupReason ? <p className="hint-message">{finishSetupReason}</p> : null}
          </>
        ) : (
          <div className="requirement-list">
            <div className="requirement-row">
              <span>White king</span>
              <strong className={game.white.king_square ? 'ok' : 'blocked'}>{game.white.king_square ?? 'Missing'}</strong>
            </div>
            <div className="requirement-row">
              <span>Black king</span>
              <strong className={game.black.king_square ? 'ok' : 'blocked'}>{game.black.king_square ?? 'Missing'}</strong>
            </div>
            <div className="requirement-row">
              <span>Setup phase</span>
              <strong className="ok">Complete</strong>
            </div>
            <div className="requirement-row">
              <span>Next stage</span>
              <strong>Autoplay pending</strong>
            </div>
          </div>
        )}
      </section>

      <section className="panel premium-card">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Primary Actions</p>
            <h2>{isSetupActive ? 'Commit Move' : 'Next Stage'}</h2>
          </div>
        </div>

        {isSetupActive ? (
          <button type="button" className="button primary action-button" onClick={onFinishSetup} disabled={!canInteract || !canFinishSetup}>
            Finish setup for {formatSide(game.setup_turn)}
          </button>
        ) : (
          <p className="hint-message">Setup is complete. Autoplay has not been implemented yet, so this screen is intentionally read-only now.</p>
        )}

        {pendingActionLabel ? <p className="status-message">{pendingActionLabel}</p> : null}
        {blockingMessage ? <p className="warning-message">{blockingMessage}</p> : null}
        {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
      </section>

      <section className="panel premium-card event-card">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Event Log</p>
            <h2>Recent Actions</h2>
          </div>
        </div>
        <ul className="event-list">
          {game.event_log.slice(-8).reverse().map((entry, index) => (
            <li key={`${index}-${entry}`}>{entry}</li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
