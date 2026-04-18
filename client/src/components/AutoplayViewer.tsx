import { useEffect, useMemo, useRef, useState } from 'react'
import { Board } from './Board'
import { buildBoardFromFen } from '../lib/board'
import type { GameState } from '../lib/api'

const PLAYBACK_SPEEDS = [
  { label: 'Slow', delayMs: 2200 },
  { label: 'Normal', delayMs: 1700 },
  { label: 'Fast', delayMs: 950 },
] as const

interface AutoplayViewerProps {
  game: GameState
  onRefresh: () => void
  onNewGame: () => void
  outcomeKnown: boolean
  onOutcomeReveal: () => void
}

function formatReplayResult(result: string | null | undefined): string {
  switch (result) {
    case '1-0':
      return 'White wins'
    case '0-1':
      return 'Black wins'
    case '1/2-1/2':
      return 'Draw'
    default:
      return result ?? 'In progress'
  }
}

export function AutoplayViewer({ game, onRefresh, onNewGame, outcomeKnown, onOutcomeReveal }: AutoplayViewerProps) {
  const [currentPly, setCurrentPly] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [speedLabel, setSpeedLabel] = useState<(typeof PLAYBACK_SPEEDS)[number]['label']>('Normal')
  const activeMoveRef = useRef<HTMLButtonElement | null>(null)
  const moves = game.autoplay.moves
  const totalPlies = moves.length
  const currentFen = currentPly === 0 ? game.autoplay.initial_fen : moves[currentPly - 1]?.fen_after
  const currentMove = currentPly === 0 ? null : moves[currentPly - 1]
  const replayFinished = totalPlies > 0 && currentPly >= totalPlies
  const resultLabel = formatReplayResult(game.autoplay.result ?? game.result)
  const resultVisibilityLabel = outcomeKnown ? resultLabel : 'Pending'
  const finalMove = moves[totalPlies - 1] ?? null
  const playbackDelayMs = PLAYBACK_SPEEDS.find((speed) => speed.label === speedLabel)?.delayMs ?? 1700

  useEffect(() => {
    setCurrentPly(0)
    setIsPlaying(true)
  }, [game.game_id, game.autoplay.initial_fen, totalPlies])

  useEffect(() => {
    if (replayFinished) {
      onOutcomeReveal()
    }
  }, [onOutcomeReveal, replayFinished])

  useEffect(() => {
    activeMoveRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: isPlaying ? 'smooth' : 'auto',
    })
  }, [currentPly, isPlaying])

  useEffect(() => {
    if (!isPlaying || currentPly >= totalPlies) {
      if (currentPly >= totalPlies) {
        setIsPlaying(false)
      }
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCurrentPly((ply) => Math.min(ply + 1, totalPlies))
    }, playbackDelayMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentPly, isPlaying, playbackDelayMs, totalPlies])

  const boardSquares = useMemo(
    () => (currentFen ? buildBoardFromFen(currentFen) : []),
    [currentFen],
  )

  return (
    <main className="layout">
      <section className="board-column">
        <div className="board-stage">
          <div className="stage-heading">
            <div>
              <p className="eyebrow">Autoplay Replay</p>
              <h2>
                {replayFinished
                  ? `Replay complete (${totalPlies}/${totalPlies})`
                  : currentMove
                    ? `${currentMove.san} (${currentPly}/${totalPlies})`
                    : 'Starting position'}
              </h2>
            </div>
          </div>

          <section className="panel board-panel premium-card">
            <div className="board-overlay-shell">
              <Board
                activeSide="white"
                interactive={false}
                disabledAppearance={false}
                selectedSquare={null}
                selectedModeLabel={currentMove ? `Move ${currentPly}: ${currentMove.san}` : 'Custom setup position'}
                squares={boardSquares}
                onSquareClick={() => {}}
              />

              {replayFinished ? (
                <div className="board-overlay">
                  <section className="board-overlay-card board-overlay-card-result">
                    <div className="panel-heading compact">
                      <div>
                        <p className="eyebrow">Final Result</p>
                        <h2>{resultLabel}</h2>
                      </div>
                      <span className="status-chip complete-chip">Replay Complete</span>
                    </div>
                    <p className="panel-copy">
                      {finalMove
                        ? `Final move: ${finalMove.san}. The replay has reached the finished position.`
                        : 'The replay has reached the finished position.'}
                    </p>
                    <div className="playback-controls playback-controls-end">
                      <button
                        type="button"
                        className="button primary action-button"
                        onClick={() => {
                          setCurrentPly(0)
                          setIsPlaying(true)
                        }}
                      >
                        Replay again
                      </button>
                      <button
                        type="button"
                        className="button action-button"
                        onClick={() => {
                          setCurrentPly(Math.max(0, totalPlies - 1))
                          setIsPlaying(false)
                        }}
                        disabled={totalPlies === 0}
                      >
                        Step through final position
                      </button>
                      <button type="button" className="button action-button" onClick={onNewGame}>
                        New game
                      </button>
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>

      <aside className="sidebar">
        <section className="panel premium-card status-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Autoplay Status</p>
              <h2 className="status-title">Replay Ready</h2>
            </div>
            <button type="button" className="button ghost small" onClick={onRefresh}>
              Refresh
            </button>
          </div>
          <div className="status-line">
            <span className={`live-dot tone-${replayFinished ? 'complete' : 'autoplay'} ${replayFinished || isPlaying ? 'on' : ''}`} />
            <strong>{replayFinished ? 'Replay complete' : isPlaying ? 'Animating moves' : 'Replay paused'}</strong>
            <span className={`status-chip tone-${replayFinished ? 'complete' : 'autoplay'} ${replayFinished ? 'complete-chip' : ''}`}>
              {replayFinished ? 'Final' : 'Live'}
            </span>
          </div>
          <div className="status-metrics">
            <div className="metric-card emphasis">
              <span>Result</span>
              <strong>{resultVisibilityLabel}</strong>
            </div>
            <div className="metric-card">
              <span>Moves</span>
              <strong>{totalPlies}</strong>
            </div>
            <div className="metric-card">
              <span>Current ply</span>
              <strong>{currentPly}</strong>
            </div>
            <div className="metric-card">
              <span>Phase</span>
              <strong>{game.phase}</strong>
            </div>
          </div>
        </section>

        <section className="panel premium-card">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Playback</p>
              <h2>Controls</h2>
            </div>
          </div>
          <div className="speed-toggle" role="group" aria-label="Autoplay speed">
            {PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed.label}
                type="button"
                className={`speed-toggle-button ${speed.label === speedLabel ? 'active' : ''}`}
                onClick={() => setSpeedLabel(speed.label)}
              >
                {speed.label}
              </button>
            ))}
          </div>
          <div className="playback-controls">
            <button
              type="button"
              className="button action-button"
              onClick={() => {
                setIsPlaying(false)
                setCurrentPly((ply) => Math.max(0, ply - 1))
              }}
              disabled={currentPly === 0}
            >
              Step Back
            </button>
            <button
              type="button"
              className="button primary action-button"
              onClick={() => {
                if (replayFinished) {
                  setCurrentPly(0)
                  setIsPlaying(true)
                  return
                }
                setIsPlaying((playing) => !playing)
              }}
              disabled={totalPlies === 0}
            >
              {replayFinished ? 'Replay again' : isPlaying ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              className="button action-button"
              onClick={() => {
                setCurrentPly(0)
                setIsPlaying(true)
              }}
              disabled={totalPlies === 0}
            >
              Restart
            </button>
            <button
              type="button"
              className="button action-button"
              onClick={() => {
                setCurrentPly(totalPlies)
                setIsPlaying(false)
              }}
              disabled={totalPlies === 0 || replayFinished}
            >
              Skip simulation
            </button>
            <button
              type="button"
              className="button action-button"
              onClick={() => {
                setIsPlaying(false)
                setCurrentPly((ply) => Math.min(totalPlies, ply + 1))
              }}
              disabled={currentPly >= totalPlies}
            >
              Step Forward
            </button>
          </div>
        </section>

        <section className="panel premium-card event-card">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Move List</p>
              <h2>Engine Game</h2>
            </div>
          </div>
          <ol className="move-list">
            {moves.map((move, index) => (
              <li key={`${move.ply}-${move.uci}`} className={index + 1 === currentPly ? 'active' : ''}>
                <button
                  type="button"
                  className="move-list-button"
                  ref={index + 1 === currentPly ? activeMoveRef : null}
                  onClick={() => {
                    setIsPlaying(false)
                    setCurrentPly(index + 1)
                  }}
                >
                  <span>#{move.ply}</span>
                  <strong>{move.san}</strong>
                  <code>{move.uci}</code>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </main>
  )
}
