import { BrandMark } from './BrandMark'

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
          <BrandMark />
          <h1>Automate Chess</h1>
        </div>
      </div>
      <div className="topbar-meta">
        <button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label="Toggle light and dark theme">
          <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
        </button>
        <div className={`pill tone-${tone}`}>{primaryPill}</div>
        {secondaryPill ? <div className={`pill tone-${tone}`}>{secondaryPill}</div> : null}
      </div>
    </header>
  )
}
