import { useEffect, useRef } from 'react'

export type AppView = 'create' | 'studio' | 'saved' | 'lab'
interface Props { view: AppView | 'landing'; savedCount: number; onNavigate: (view: AppView) => void; onAbout: (keyboard: boolean) => void; onSettings: () => void }

export function Sidebar({ view, savedCount, onNavigate, onAbout, onSettings }: Props) {
  const tools = useRef<HTMLDetailsElement>(null)
  const close = () => { if (tools.current) tools.current.open = false }
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!tools.current?.contains(event.target as Node)) close() }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  return <header className="app-header"><nav className="app-nav" aria-label="Application navigation">
    <button className="app-wordmark" onClick={() => onNavigate('create')} aria-label="Neologism — Create">
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 2 10 10-10 10L2 12 12 2Z" stroke="currentColor" strokeWidth="1.5"/><path d="m8 15 3-7 5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg><span>neologism</span>
    </button>
    <div className="app-nav-items">
      <button onClick={() => onNavigate('create')} aria-current={view === 'create' ? 'page' : undefined}>Create</button>
      <button onClick={() => onNavigate('saved')} aria-current={view === 'saved' ? 'page' : undefined}>Saved{savedCount > 0 && <span className="saved-count">{savedCount}</span>}</button>
      <details className="tools-menu" ref={tools} onKeyDown={event => { if (event.key === 'Escape') { close(); tools.current?.querySelector('summary')?.focus() } }}>
        <summary className={view === 'lab' || view === 'studio' || view === 'landing' ? 'current-tool' : ''}>Tools<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5"/></svg></summary>
        <div className="tools-popover">
          <button onClick={() => { close(); onNavigate('lab') }} aria-current={view === 'lab' ? 'page' : undefined}>Lab<span>Explore individual methods</span></button>
          <button onClick={() => { close(); onNavigate('studio') }} aria-current={view === 'studio' ? 'page' : undefined}>AI Studio<span>Optional AI-assisted review</span></button>
          <button onClick={() => { close(); onSettings() }}>Settings</button>
          <button onClick={event => { close(); onAbout(event.detail === 0) }}>About</button>
        </div>
      </details>
    </div>
  </nav></header>
}
