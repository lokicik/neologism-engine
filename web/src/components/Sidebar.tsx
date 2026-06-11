import { IconSparkle, IconStar } from './icons'

export type AppView = 'create' | 'saved'

interface Props {
  view: AppView
  savedCount: number
  onNavigate: (view: AppView) => void
  onAbout: () => void
}

// Phase 47 app shell: slim fixed sidebar (the Midjourney-web pattern — saved
// work is a first-class page, not a drawer). Collapses to a horizontal top
// bar below 900px (CSS).
export function Sidebar({ view, savedCount, onNavigate, onAbout }: Props) {
  return (
    <nav className="sidebar">
      <button className="wordmark sidebar-logo" onClick={onAbout} title="About — back to the landing page">
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
          className={`sidebar-item${view === 'saved' ? ' active' : ''}`}
          onClick={() => onNavigate('saved')}
        >
          <IconStar filled={savedCount > 0} /> Saved
          {savedCount > 0 && <span className="count-pill">{savedCount}</span>}
        </button>
      </div>

      <button className="sidebar-about" onClick={onAbout}>
        About
      </button>
    </nav>
  )
}
