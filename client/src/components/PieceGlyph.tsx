import type { PieceType, Side } from '../lib/api'

interface PieceGlyphProps {
  piece: PieceType
  side?: Side
  tone?: 'active' | 'waiting' | 'shop'
  className?: string
}

function PieceSvg({
  piece,
  className,
}: {
  piece: PieceType
  className: string
}) {
  switch (piece) {
    case 'P':
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
          <circle className="piece-base" cx="32" cy="17" r="6.8" />
          <path
            className="piece-base"
            d="M27.5 25.5h9c0 3.1 1.7 5.7 4.8 7.8 2.4 1.6 3.9 4.1 3.9 7.4 0 2.9-0.8 5.7-2.5 8.3H21.4c-1.7-2.6-2.5-5.4-2.5-8.3 0-3.3 1.5-5.8 3.9-7.4 3.1-2.1 4.7-4.7 4.7-7.8Z"
          />
          <path className="piece-detail" d="M24 39.5c5.3-2.2 10.7-2.2 16 0" />
          <path className="piece-base" d="M18.5 52h27v4.8h-27z" />
        </svg>
      )
    case 'N':
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
          <path
            className="piece-base"
            d="M21 51V45l9-8-5-10 6-14 10 5 3 10-5 5 5 6v12H21Z"
          />
          <path className="piece-detail" d="M31 18c4 1 7 3 10 7" />
          <path className="piece-detail" d="M28 29c3 1 7 1 11-1" />
          <circle className="piece-detail-dot" cx="35.5" cy="23" r="1.7" />
          <path className="piece-base" d="M18 52h30v4H18z" />
        </svg>
      )
    case 'B':
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
          <path className="piece-base" d="M32 10l8 10-3 8 6 9-6 12H27l-6-12 6-9-3-8 8-10Z" />
          <path className="piece-detail" d="M32 15l-3 18" />
          <path className="piece-detail" d="M26 35c4-1 8-1 12 0" />
          <path className="piece-base" d="M19 52h26v5H19z" />
        </svg>
      )
    case 'R':
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
          <path className="piece-base" d="M20 12h5v7h5v-7h4v7h5v-7h5v15H20z" />
          <path className="piece-base" d="M23 30h18l-2 18H25z" />
          <path className="piece-detail" d="M25 24h14" />
          <path className="piece-base" d="M18 52h28v5H18z" />
        </svg>
      )
    case 'Q':
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
          <circle className="piece-base" cx="18" cy="18" r="3.2" />
          <circle className="piece-base" cx="27" cy="14" r="3.2" />
          <circle className="piece-base" cx="37" cy="14" r="3.2" />
          <circle className="piece-base" cx="46" cy="18" r="3.2" />
          <path className="piece-base" d="M18 23l6 8 8-10 8 10 6-8-4 25H22z" />
          <path className="piece-detail" d="M24 36c5-2 11-2 16 0" />
          <path className="piece-base" d="M18 52h28v5H18z" />
        </svg>
      )
    case 'K':
      return (
        <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
          <path className="piece-base" d="M24 23h16l-2 8 5 7-6 11H27l-6-11 5-7-2-8Z" />
          <path className="piece-detail" d="M24 35c5-2 11-2 16 0" />
          <path className="piece-king-cross" d="M32 9v12" />
          <path className="piece-king-cross" d="M26 15h12" />
          <path className="piece-base" d="M18 52h28v5H18z" />
        </svg>
      )
    default:
      return null
  }
}

export function PieceGlyph({
  piece,
  side = 'white',
  tone = 'active',
  className = '',
}: PieceGlyphProps) {
  return (
    <PieceSvg
      piece={piece}
      className={`piece-glyph ${tone} ${side} ${className}`.trim()}
    />
  )
}
