import type { PieceType, Side } from '../lib/api'

const PIECE_SYMBOLS: Record<Side, Record<PieceType, string>> = {
  white: {
    P: '♙',
    N: '♘',
    B: '♗',
    R: '♖',
    Q: '♕',
    K: '♔',
  },
  black: {
    P: '♟',
    N: '♞',
    B: '♝',
    R: '♜',
    Q: '♛',
    K: '♚',
  },
}

interface PieceGlyphProps {
  piece: PieceType
  side?: Side
  tone?: 'active' | 'waiting' | 'shop'
  className?: string
}

export function PieceGlyph({
  piece,
  side = 'white',
  tone = 'active',
  className = '',
}: PieceGlyphProps) {
  return (
    <span className={`piece-glyph ${tone} ${className}`.trim()} aria-hidden="true">
      {PIECE_SYMBOLS[side][piece]}
    </span>
  )
}
