export type HeaderTone = 'setup' | 'autoplay' | 'complete' | 'connected' | 'connecting' | 'disconnected'
export type AppTheme = 'dark' | 'light'

interface AppHeaderProps {
  primaryPill?: string
  secondaryPill?: string
  primaryPillClassName?: string
  secondaryPillClassName?: string
  secondaryTone?: HeaderTone
  tone: HeaderTone
  theme: AppTheme
  onToggleTheme: () => void
  onBackToMenu?: () => void
  backLabel?: string
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="theme-icon">
      <circle cx="12" cy="12" r="4.3" />
      <path d="M12 2.5v2.8M12 18.7v2.8M4.9 4.9l2 2M17.1 17.1l2 2M2.5 12h2.8M18.7 12h2.8M4.9 19.1l2-2M17.1 6.9l2-2" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="theme-icon">
      <path d="M15.9 3.4a8.6 8.6 0 1 0 4.7 15.6A9.8 9.8 0 0 1 15.9 3.4Z" />
    </svg>
  )
}

function ExitIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="header-action-icon">
      <path d="M10 5H5.5A1.5 1.5 0 0 0 4 6.5v11A1.5 1.5 0 0 0 5.5 19H10" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H8" />
    </svg>
  )
}

export function AppHeader({
  primaryPill,
  secondaryPill,
  primaryPillClassName,
  secondaryPillClassName,
  secondaryTone,
  tone,
  theme,
  onToggleTheme,
  onBackToMenu,
  backLabel = 'Back to menu',
}: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="wordmark-row">
          <div className="brand-mark" aria-hidden="true">
            <img src="/automate-logo.png" alt="" className="brand-logo-image" />
          </div>
          <h1>Automate Chess</h1>
        </div>
      </div>
      <div className="topbar-meta">
        {onBackToMenu ? (
          <button type="button" className="topbar-action" onClick={onBackToMenu}>
            <ExitIcon />
            <span>{backLabel}</span>
          </button>
        ) : null}
        <button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label="Toggle light and dark theme">
          {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
        </button>
        {primaryPill ? (
          <div className={`pill tone-${tone}${primaryPillClassName ? ` ${primaryPillClassName}` : ''}`}>
            <span className={`pill-dot tone-${tone}`} aria-hidden="true" />
            <span>{primaryPill}</span>
          </div>
        ) : null}
        {secondaryPill ? (
          <div className={`pill tone-${secondaryTone ?? tone}${secondaryPillClassName ? ` ${secondaryPillClassName}` : ''}`}>
            <span className={`pill-dot tone-${secondaryTone ?? tone}`} aria-hidden="true" />
            <span>{secondaryPill}</span>
          </div>
        ) : null}
      </div>
    </header>
  )
}
