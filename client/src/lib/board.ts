import type { PieceType, Side } from './api'
import type { BoardSquareData } from '../components/Board'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const

function fenPieceToBoardPiece(symbol: string): { piece: PieceType; side: Side } {
  const side: Side = symbol === symbol.toUpperCase() ? 'white' : 'black'
  const upper = symbol.toUpperCase() as PieceType
  return { piece: upper, side }
}

export function buildBoardFromFen(fen: string): BoardSquareData[] {
  const [placement] = fen.split(' ')
  const rows = placement.split('/')
  const squares: BoardSquareData[] = []

  for (let rankIndex = 0; rankIndex < rows.length; rankIndex += 1) {
    const row = rows[rankIndex]
    let fileIndex = 0

    for (const char of row) {
      if (/\d/.test(char)) {
        const emptyCount = Number(char)
        for (let offset = 0; offset < emptyCount; offset += 1) {
          squares.push({
            square: `${FILES[fileIndex]}${8 - rankIndex}`,
            piece: null,
            side: null,
          })
          fileIndex += 1
        }
      } else {
        const { piece, side } = fenPieceToBoardPiece(char)
        squares.push({
          square: `${FILES[fileIndex]}${8 - rankIndex}`,
          piece,
          side,
        })
        fileIndex += 1
      }
    }
  }

  return squares
}
