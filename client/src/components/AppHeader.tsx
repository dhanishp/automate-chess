export type HeaderTone = 'setup' | 'autoplay' | 'complete'
export type AppTheme = 'dark' | 'light'

interface AppHeaderProps {
  primaryPill: string
  secondaryPill?: string
  tone: HeaderTone
  theme: AppTheme
  onToggleTheme: () => void
}

export function AppHeader({ primaryPill, secondaryPill, tone, theme, onToggleTheme }: AppHeaderProps) {
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
        <button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label="Toggle light and dark theme">
          <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
        </button>
        <div className={`pill tone-${tone}`}>
          <span className={`pill-dot tone-${tone}`} aria-hidden="true" />
          <span>{primaryPill}</span>
        </div>
        {secondaryPill ? (
          <div className={`pill tone-${tone}`}>
            <span className={`pill-dot tone-${tone}`} aria-hidden="true" />
            <span>{secondaryPill}</span>
          </div>
        ) : null}
      </div>
    </header>
  )
}
