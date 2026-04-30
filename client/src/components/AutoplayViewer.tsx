import { useEffect, useMemo, useRef, useState } from 'react'
import { Board } from './Board'
import { ConfirmationModal } from './ConfirmationModal'
import { buildBoardFromFen } from '../lib/board'
import type { GameState } from '../lib/api'

const PLAYBACK_SPEEDS = [
  { label: 'Slow', delayMs: 2200 },
  { label: 'Normal', delayMs: 1350 },
  { label: 'Fast', delayMs: 550 },
] as const

interface AutoplayViewerProps {
  game: GameState
  onRefresh: () => void
  onNewGame: () => void
  onBackToMenu: () => void
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

function buildReplayNotation(game: GameState, resultLabel: string): string {
  const lines = [
    'Automate Chess battle simulation',
    `Result: ${resultLabel}`,
    `Starting FEN: ${game.autoplay.initial_fen ?? 'Unavailable'}`,
    `Final FEN: ${game.autoplay.final_fen ?? 'Unavailable'}`,
    '',
    'Moves:',
  ]

  if (game.autoplay.moves.length === 0) {
    lines.push('No engine moves recorded.')
  } else {
    lines.push(
      ...game.autoplay.moves.map((move) => `${move.ply}. ${move.san} (${move.uci})`),
    )
  }

  return lines.join('\n')
}

async function writeTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.append(textArea)
  textArea.select()
  const copied = document.execCommand('copy')
  textArea.remove()

  if (!copied) {
    throw new Error('Clipboard copy failed.')
  }
}

function StepBackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="control-icon">
      <path d="M11 6l-6 6 6 6" />
      <path d="M19 6l-6 6 6 6" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="control-icon">
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="control-icon">
      <path d="M8 5l11 7-11 7Z" />
    </svg>
  )
}

function StepForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="control-icon">
      <path d="M13 6l6 6-6 6" />
      <path d="M5 6l6 6-6 6" />
    </svg>
  )
}

export function AutoplayViewer({ game, onRefresh, onNewGame, onBackToMenu, outcomeKnown, onOutcomeReveal }: AutoplayViewerProps) {
  const [currentPly, setCurrentPly] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [speedLabel, setSpeedLabel] = useState<(typeof PLAYBACK_SPEEDS)[number]['label']>('Normal')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [replayConfirmation, setReplayConfirmation] = useState<'restart' | 'new_game' | null>(null)
  const activeMoveRef = useRef<HTMLButtonElement | null>(null)
  const moveListRef = useRef<HTMLOListElement | null>(null)
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
    setCopyStatus('idle')
    setReplayConfirmation(null)
  }, [game.game_id, game.autoplay.initial_fen, totalPlies])

  useEffect(() => {
    if (replayFinished) {
      onOutcomeReveal()
    }
  }, [onOutcomeReveal, replayFinished])

  useEffect(() => {
    const activeMove = activeMoveRef.current
    const moveList = moveListRef.current
    if (!activeMove || !moveList) {
      return
    }

    const moveTop = activeMove.offsetTop
    const moveBottom = moveTop + activeMove.offsetHeight
    const visibleTop = moveList.scrollTop
    const visibleBottom = visibleTop + moveList.clientHeight

    if (moveTop < visibleTop) {
      moveList.scrollTo({
        top: Math.max(0, moveTop - 8),
        behavior: isPlaying ? 'smooth' : 'auto',
      })
      return
    }

    if (moveBottom > visibleBottom) {
      moveList.scrollTo({
        top: moveBottom - moveList.clientHeight + 8,
        behavior: isPlaying ? 'smooth' : 'auto',
      })
    }
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

  async function handleCopyMoveList() {
    try {
      await writeTextToClipboard(buildReplayNotation(game, resultLabel))
      setCopyStatus('copied')
      window.setTimeout(() => setCopyStatus('idle'), 1800)
    } catch {
      setCopyStatus('failed')
    }
  }

  function restartReplay() {
    setCurrentPly(0)
    setIsPlaying(true)
  }

  const replayConfirmationModal = replayConfirmation ? (
    <ConfirmationModal
      eyebrow={replayConfirmation === 'restart' ? 'Restart battle' : 'New setup'}
      title={replayConfirmation === 'restart' ? 'Restart battle playback?' : 'Start a new game?'}
      message={
        replayConfirmation === 'restart'
          ? 'Return to the starting position and play this battle from the beginning.'
          : 'Leave this battle and begin a fresh formation.'
      }
      confirmLabel={replayConfirmation === 'restart' ? 'Restart battle' : 'New game'}
      confirmTone={replayConfirmation === 'restart' ? 'primary' : 'danger'}
      onCancel={() => setReplayConfirmation(null)}
      onConfirm={() => {
        if (replayConfirmation === 'restart') {
          restartReplay()
        } else {
          onNewGame()
        }
        setReplayConfirmation(null)
      }}
    />
  ) : null

  return (
    <>
    <main className="layout">
      <section className="board-column">
        <div className="board-stage">
          <div className="stage-heading">
            <div>
              <p className="eyebrow">Battle</p>
              <h2>
                {replayFinished
                  ? `Battle complete (${totalPlies}/${totalPlies})`
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
                      <span className="status-chip complete-chip">Complete</span>
                    </div>
                    <p className="panel-copy">
                      {finalMove
                        ? `Final move: ${finalMove.san}. The finished position is resolved.`
                        : 'The finished position is resolved.'}
                    </p>
                    <div className="playback-controls playback-controls-end">
                      <button
                        type="button"
                        className="button primary action-button"
                        onClick={() => setReplayConfirmation('restart')}
                      >
                        Watch again
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
                        Review final position
                      </button>
                      <button type="button" className="button action-button" onClick={() => setReplayConfirmation('new_game')}>
                        New game
                      </button>
                      <button type="button" className="button ghost action-button" onClick={onBackToMenu}>
                        Back to menu
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
              <p className="eyebrow">Battle Status</p>
              <h2 className="status-title">Battle Ready</h2>
            </div>
            <button type="button" className="button ghost small" onClick={onRefresh}>
              Refresh
            </button>
          </div>
          <div className="status-line">
            <span className={`live-dot tone-${replayFinished ? 'complete' : 'autoplay'} ${replayFinished || isPlaying ? 'on' : ''}`} />
            <strong>{replayFinished ? 'Battle complete' : isPlaying ? 'Simulating battle' : 'Battle paused'}</strong>
            <span className={`status-chip tone-${replayFinished ? 'complete' : 'autoplay'} ${replayFinished ? 'complete-chip' : ''}`}>
              {replayFinished ? 'Final' : 'Playing'}
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
              <strong>Battle</strong>
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
          <div className="speed-toggle" role="group" aria-label="Battle speed">
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
          <div className="playback-controls playback-controls-transport" role="group" aria-label="Battle transport controls">
            <button
              type="button"
              className="button action-button icon-action"
              onClick={() => {
                setIsPlaying(false)
                setCurrentPly((ply) => Math.max(0, ply - 1))
              }}
              disabled={currentPly === 0}
            >
              <StepBackIcon />
              <span>Back</span>
            </button>
            <button
              type="button"
              className="button primary action-button icon-action"
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
              {replayFinished || !isPlaying ? <PlayIcon /> : <PauseIcon />}
              <span>{replayFinished ? 'Play' : isPlaying ? 'Pause' : 'Resume'}</span>
            </button>
            <button
              type="button"
              className="button action-button icon-action"
              onClick={() => {
                setIsPlaying(false)
                setCurrentPly((ply) => Math.min(totalPlies, ply + 1))
              }}
              disabled={currentPly >= totalPlies}
            >
              <StepForwardIcon />
              <span>Forward</span>
            </button>
          </div>

          <div className="playback-controls playback-controls-secondary">
            <button
              type="button"
              className="button action-button"
              onClick={() => setReplayConfirmation('restart')}
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
              Jump to end
            </button>
            <button type="button" className="button ghost action-button" onClick={onBackToMenu}>
              Back to menu
            </button>
          </div>
        </section>

        <section className="panel premium-card event-card">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Move List</p>
              <h2>Battle Notation</h2>
            </div>
            <button type="button" className="button ghost small copy-move-button" onClick={() => void handleCopyMoveList()}>
              Copy move list
            </button>
          </div>
          {copyStatus !== 'idle' ? (
            <p className={copyStatus === 'copied' ? 'status-message copy-status' : 'error-message copy-status'}>
              {copyStatus === 'copied' ? 'Copied battle notation.' : 'Copy failed. Try selecting the move list manually.'}
            </p>
          ) : null}
          <ol className="move-list" ref={moveListRef}>
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
    {replayConfirmationModal}
    </>
  )
}
