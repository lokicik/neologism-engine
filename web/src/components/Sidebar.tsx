import { IconSparkle, IconStar } from './icons'

export type AppView = 'create' | 'studio' | 'saved'

interface Props {
  view: AppView
  savedCount: number
  onNavigate: (view: AppView) => void
  onAbout: (keyboard: boolean) => void
  onSettings: () => void
}

// Phase 47 app shell: slim fixed sidebar (the Midjourney-web pattern — saved
// work is a first-class page, not a drawer). Collapses to a horizontal top
// bar below 900px (CSS).
export function Sidebar({ view, savedCount, onNavigate, onAbout, onSettings }: Props) {
  return (
    <nav className="sidebar">
      <button className="wordmark sidebar-logo" onClick={(event) => onAbout(event.detail === 0)} title="About — back to the landing page">
        ◈ neologism
      </button>

      <div className="sidebar-nav">
        <button
          className={`sidebar-item${view === 'create' ? ' active' : ''}`}
          onClick={() => onNavigate('create')}
        >
          <IconSparkle /> Create
        </button>
        <button
          className={`sidebar-item${view === 'studio' ? ' active' : ''}`}
          onClick={() => onNavigate('studio')}
        >
          <span className="studio-glyph" aria-hidden>✨</span> AI Studio
        </button>
        <button
          className={`sidebar-item${view === 'saved' ? ' active' : ''}`}
          onClick={() => onNavigate('saved')}
        >
          <IconStar filled={savedCount > 0} /> Saved
          {savedCount > 0 && <span className="count-pill">{savedCount}</span>}
        </button>
      </div>

      <div className="sidebar-foot">
        <button className="sidebar-item sidebar-settings" onClick={onSettings} title="AI model and local taste settings">
          ⚙ Settings
        </button>
        <button className="sidebar-about" onClick={(event) => onAbout(event.detail === 0)}>
          About
        </button>
      </div>
    </nav>
  )
}
