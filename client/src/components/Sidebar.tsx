import type { GameState, PieceType, RoomStatus, Side } from '../lib/api'
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
  isBotGame: boolean
  isMultiplayer: boolean
  roomCode: string | null
  roomStatus: RoomStatus | null
  humanSideLabel: string | null
  shopPreviewSide: Side
  isHumanSetupTurn: boolean
  errorMessage: string | null
  blockingMessage: string | null
  pendingActionLabel: string | null
  canFinishSetup: boolean
  canPlaceKing: boolean
  finishSetupReason: string | null
  kingPlacementReason: string | null
  sharedRequirementReason: string | null
  onSelectPiece: (piece: PieceType) => void
  onFinishSetup: () => void
  onCopyInviteLink?: () => void
  onRefresh: () => void
  onLoadSample: () => void
  onDownloadLog: () => void
  inviteCopied?: boolean
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

function InviteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="metric-action-icon">
      <path d="M9.5 14.5l5-5" />
      <path d="M13.5 6.5l1.1-1.1a4 4 0 0 1 5.7 5.7l-2.2 2.2a4 4 0 0 1-5.7 0" />
      <path d="M10.5 17.5l-1.1 1.1a4 4 0 0 1-5.7-5.7l2.2-2.2a4 4 0 0 1 5.7 0" />
    </svg>
  )
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
  isBotGame,
  isMultiplayer,
  roomCode,
  roomStatus,
  humanSideLabel,
  shopPreviewSide,
  isHumanSetupTurn,
  errorMessage,
  blockingMessage,
  pendingActionLabel,
  canFinishSetup,
  canPlaceKing,
  finishSetupReason,
  kingPlacementReason,
  sharedRequirementReason,
  onSelectPiece,
  onFinishSetup,
  onCopyInviteLink,
  onRefresh,
  onLoadSample,
  onDownloadLog,
  inviteCopied = false,
  statusTone,
}: SidebarProps) {
  const activePlayer = game[game.setup_turn]
  const canInteract = isSetupActive && pendingActionLabel === null && isHumanSetupTurn && (!isMultiplayer || roomStatus === 'active')
  const activeSideLabel = formatSide(game.setup_turn)
  const shopPreviewSideLabel = formatSide(shopPreviewSide)
  const isLivePhase = isSetupActive
  const turnSummary = isMultiplayer
    ? roomStatus === 'waiting'
      ? 'Waiting for opponent'
      : isHumanSetupTurn
        ? `Your turn: ${activeSideLabel}`
        : `Opponent placing ${activeSideLabel}`
    : isBotGame
    ? isHumanSetupTurn
      ? `Your turn: ${activeSideLabel}`
      : `Bot placing ${activeSideLabel}`
    : `${activeSideLabel} to move`
  const pieceOptions = (['P', 'N', 'B', 'R', 'Q', 'K'] as PieceType[]).map((piece) => ({
    piece,
    label: PIECE_LABELS[piece],
    cost: game.rules.costs[piece],
    enabled: canInteract && canPlacePieceTypeNow(game, piece),
  }))
  const finishSetupLabel =
    isMultiplayer && roomStatus === 'waiting'
      ? 'Waiting for opponent'
      : isMultiplayer && !isHumanSetupTurn
        ? `Waiting for ${activeSideLabel}`
        : isBotGame && !isHumanSetupTurn
          ? 'Waiting for bot'
          : `Finish setup for ${activeSideLabel}`

  return (
    <aside className="sidebar">
      <section className="panel status-panel premium-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Setup Status</p>
            <h2 className="status-title">{formatPhase(game.phase)}</h2>
          </div>
          <button type="button" className="button ghost small" onClick={onRefresh} disabled={pendingActionLabel !== null}>
            Refresh
          </button>
        </div>

        <div className="status-line">
          <span className={`live-dot tone-${statusTone} ${isLivePhase ? 'on' : ''}`} />
          <strong>{isSetupActive ? turnSummary : 'Setup locked'}</strong>
          <span className={`status-chip tone-${statusTone}`}>{isLivePhase ? 'Live' : 'Locked'}</span>
        </div>

        <div className={`status-metrics ${isMultiplayer ? 'room-info-grid' : ''}`}>
          {(isBotGame || isMultiplayer) ? (
            <div className="metric-card">
              <span>You</span>
              <strong>{humanSideLabel ?? 'Random'}</strong>
            </div>
          ) : null}
          {isBotGame ? (
            <div className="metric-card">
              <span>Mode</span>
              <strong>Singleplayer vs Bot</strong>
            </div>
          ) : null}
          {isMultiplayer ? (
            <div className="metric-card">
              <span>Mode</span>
              <strong>Room Match</strong>
            </div>
          ) : null}
          {isMultiplayer ? (
            <div className="metric-card">
              <span>Room</span>
              <strong>{roomCode ?? '—'}</strong>
            </div>
          ) : null}
          {isMultiplayer && roomCode && onCopyInviteLink ? (
            <button type="button" className="metric-card metric-card-button invite-metric-card" onClick={onCopyInviteLink}>
              <span className="metric-action-label">
                Invite
                <InviteIcon />
              </span>
              <strong>{inviteCopied ? 'Copied invite link' : 'Copy invite link'}</strong>
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel premium-card">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Piece Shop</p>
            <h2>Build Formation</h2>
          </div>
        </div>
        <p className="panel-copy">
          {isMultiplayer && roomStatus === 'waiting'
            ? 'Share the room code. Setup unlocks when Black joins.'
            : isMultiplayer && !isHumanSetupTurn
              ? `Opponent is placing ${activeSideLabel.toLowerCase()}. Your board unlocks on your turn.`
            : isBotGame && !isHumanSetupTurn
            ? `The bot is placing ${activeSideLabel.toLowerCase()}. Controls return on your next turn.`
            : `Choose a piece, then click a highlighted square. Kings are placed last.`}
        </p>
        <div className="shop-points-strip">
          <div className={`shop-points-card side-white ${game.setup_turn === 'white' ? 'active' : ''}`}>
            <span>White</span>
            <strong>{game.white.points_remaining}</strong>
          </div>
          <div className={`shop-points-card side-black ${game.setup_turn === 'black' ? 'active' : ''}`}>
            <span>Black</span>
            <strong>{game.black.points_remaining}</strong>
          </div>
          <div className="shop-points-card emphasis">
            <span>Selected</span>
            <strong>{selectedPieceLabel}</strong>
          </div>
        </div>
        <div className="shop-preview-badge">
          <span className="shop-preview-dot" />
          Previewing {shopPreviewSideLabel}
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
                <PieceGlyph piece={piece} side={shopPreviewSide} tone="shop" className="shop-piece" />
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
            <p className="eyebrow">Actions</p>
            <h2>{isSetupActive ? 'Setup Actions' : 'Next Stage'}</h2>
          </div>
        </div>

        {isSetupActive ? (
          <>
            <button type="button" className="button primary action-button" onClick={onFinishSetup} disabled={!canInteract || !canFinishSetup}>
              {finishSetupLabel}
            </button>
            {canFinishSetup ? (
              <p className="hint-message compact-hint">Lock this side's budget. King placement comes next.</p>
            ) : null}
            <button
              type="button"
              className="button ghost secondary-utility-button"
              onClick={onLoadSample}
              disabled={!canInteract || isMultiplayer}
            >
              Load sample
            </button>
          </>
        ) : (
          <>
            <p className="hint-message">Setup is locked. Replay state is read-only.</p>
          </>
        )}

        {isMultiplayer && isSetupActive && roomStatus === 'waiting' && !pendingActionLabel ? (
          <p className="status-message">Waiting for Black. Share the room code to begin.</p>
        ) : null}
        {isMultiplayer && isSetupActive && roomStatus === 'active' && !isHumanSetupTurn && !pendingActionLabel ? (
          <p className="status-message">Opponent turn. Live updates appear automatically.</p>
        ) : null}
        {isBotGame && isSetupActive && !isHumanSetupTurn && !pendingActionLabel ? (
          <p className="status-message">Bot turn. Controls unlock after it responds.</p>
        ) : null}
        {pendingActionLabel ? <p className="status-message">{pendingActionLabel}</p> : null}
        {blockingMessage ? <p className="warning-message">{blockingMessage}</p> : null}
        {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
      </section>

      <section className="panel premium-card">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Setup Requirements</p>
            <h2>Validation</h2>
          </div>
        </div>

        {isSetupActive ? (
          <>
            <div className="requirement-list">
              <div className="requirement-row">
                <span>Pawns placed</span>
                <strong>{activePlayer.pieces.filter((piece) => piece.type === 'P').length}/{game.rules.mandatory_pawns}</strong>
              </div>
              <div className="requirement-row">
                <span>Can finish</span>
                <strong className={canFinishSetup ? 'ok' : 'blocked'}>{canFinishSetup ? 'Yes' : 'No'}</strong>
              </div>
              <div className="requirement-row">
                <span>Can place king</span>
                <strong className={canPlaceKing ? 'ok' : 'blocked'}>{canPlaceKing ? 'Yes' : 'No'}</strong>
              </div>
              <div className="requirement-row">
                <span>Budget locked</span>
                <strong className={activePlayer.finished_spending ? 'ok' : 'blocked'}>{activePlayer.finished_spending ? 'Yes' : 'No'}</strong>
              </div>
              <div className="requirement-row">
                <span>King</span>
                <strong>{activePlayer.king_square ?? 'Not yet'}</strong>
              </div>
            </div>

            {sharedRequirementReason ? <p className="hint-message">{sharedRequirementReason}</p> : null}
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
              <span>Setup</span>
              <strong className="ok">Complete</strong>
            </div>
            <div className="requirement-row">
              <span>Next stage</span>
              <strong>Calculating soon</strong>
            </div>
          </div>
        )}
      </section>

      <section className="panel premium-card event-card">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Event Log</p>
            <h2>Recent Actions</h2>
          </div>
          <button type="button" className="button ghost small" onClick={onDownloadLog}>
            Download
          </button>
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
