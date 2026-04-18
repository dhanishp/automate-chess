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
}: SidebarProps) {
  const activePlayer = game[game.setup_turn]
  const canInteract = isSetupActive && pendingActionLabel === null
  const activeSideLabel = formatSide(game.setup_turn)
  const isLivePhase = isSetupActive
  const pieceOptions = (['P', 'N', 'B', 'R', 'Q', 'K'] as PieceType[]).map((piece) => ({
    piece,
    label: PIECE_LABELS[piece],
    cost: game.rules.costs[piece],
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
          <span className={`live-dot ${isLivePhase ? 'on' : ''}`} />
          <strong>{isSetupActive ? `${activeSideLabel} to move` : 'Setup interactions disabled'}</strong>
          <span className="status-chip">{isLivePhase ? 'Live phase' : 'Locked'}</span>
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
          {pieceOptions.map(({ piece, label, cost }) => {
            const isKingTile = piece === 'K'
            const isSelected = isKingTile ? isKingPlacementMode : selectedPiece === piece && !isKingPlacementMode
            const isLocked = isKingTile ? (!canPlaceKing || !canInteract) : !canInteract

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
                <span>{isKingTile ? (canPlaceKing && isSetupActive ? 'Ready' : 'Locked') : `${cost} pts`}</span>
              </span>
              {isKingTile && !canPlaceKing ? <span className="piece-lock-badge">Locked</span> : null}
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
