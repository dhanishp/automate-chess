import type { PieceType, Side } from '../lib/api'
import { PieceGlyph } from './PieceGlyph'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const

export interface BoardSquareData {
  square: string
  piece: PieceType | null
  side: Side | null
}

interface BoardProps {
  activeSide: Side
  interactive: boolean
  disabledAppearance?: boolean
  legalTargetSquares?: string[]
  selectedSquare: string | null
  selectedModeLabel: string
  squares: BoardSquareData[]
  onSquareClick: (square: string) => void
}

export function Board({
  activeSide,
  interactive,
  disabledAppearance = !interactive,
  legalTargetSquares = [],
  selectedSquare,
  selectedModeLabel,
  squares,
  onSquareClick,
}: BoardProps) {
  const legalTargets = new Set(legalTargetSquares)

  return (
    <div className="board-wrap">
      <div className="board-meta">
        <span>Board</span>
        <strong>{selectedModeLabel}</strong>
      </div>

      <div className="board-side-label top" aria-hidden="true">Black</div>

      <div
        className={`board ${interactive ? 'is-interactive' : ''} ${disabledAppearance ? 'is-muted' : 'is-readonly'}`}
        aria-label="Automate setup board"
      >
        {squares.map((squareData, index) => {
          const rank = 8 - Math.floor(index / 8)
          const file = FILES[index % 8]
          const isDark = (Math.floor(index / 8) + (index % 8)) % 2 === 1
          const isSelected = selectedSquare === squareData.square
          const isLegalTarget = legalTargets.has(squareData.square)

          return (
            <button
              key={squareData.square}
              type="button"
              className={`board-square ${isDark ? 'dark' : 'light'} ${isSelected ? 'selected' : ''} ${isLegalTarget ? 'legal-target' : ''}`}
              onClick={() => {
                if (interactive) {
                  onSquareClick(squareData.square)
                }
              }}
              disabled={!interactive && disabledAppearance}
              aria-disabled={!interactive}
              aria-label={`${squareData.square}${squareData.piece ? ` occupied by ${squareData.side} ${squareData.piece}` : ''}${isLegalTarget ? ' legal placement target' : ''}`}
            >
              <span className="square-rank">{file === 'a' ? rank : ''}</span>
              <span className="square-file">{rank === 1 ? file : ''}</span>
              {isLegalTarget ? <span className="legal-target-marker" aria-hidden="true" /> : null}
              <span className="piece-slot" aria-hidden="true">
                {squareData.piece && squareData.side ? (
                  <PieceGlyph
                    piece={squareData.piece}
                    side={squareData.side}
                    tone={squareData.side === activeSide ? 'active' : 'waiting'}
                    className="board-piece"
                  />
                ) : null}
              </span>
            </button>
          )
        })}
      </div>

      <div className="board-side-label bottom" aria-hidden="true">White</div>
    </div>
  )
}
