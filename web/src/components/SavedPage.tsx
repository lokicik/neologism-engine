import { useState } from 'react'
import type { NameResult } from '../lib/engine'
import { exportText, exportJson, encodeShareUrl } from '../lib/share'
import { NameCard } from './NameCard'
import { IconCopy, IconCheck, IconDownload, IconLink } from './icons'

interface Props {
  favorites: NameResult[]
  onToggleFavorite: (r: NameResult) => void
  onGoCreate: () => void
}

// Phase 47: Saved is a first-class page — large header, real icon toolbar,
// and the full NameCard experience for every saved name (Why, Availability,
// copy; unstarring removes it from the collection).
export function SavedPage({ favorites, onToggleFavorite, onGoCreate }: Props) {
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)

  function copyAll() {
    const text = favorites.map((f) => f.name).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 1500)
    })
  }

  function shareLink() {
    const url = encodeShareUrl(favorites)
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 1500)
    })
  }

  if (favorites.length === 0) {
    return (
      <div className="saved-page">
        <header className="page-header">
          <h1 className="page-title">Saved names</h1>
        </header>
        <div className="empty-state">
          <p>Nothing saved yet — star names you like while generating.</p>
          <div className="example-chips">
            <button className="example-chip" onClick={onGoCreate}>
              ✦ Go create
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="saved-page">
      <header className="page-header">
        <h1 className="page-title">
          Saved names <span className="count-pill">{favorites.length}</span>
        </h1>
        <div className="page-toolbar">
          <button className="toolbar-btn" onClick={copyAll}>
            {copiedAll ? <IconCheck /> : <IconCopy />} Copy all
          </button>
          <button className="toolbar-btn" onClick={() => exportText(favorites)}>
            <IconDownload /> TXT
          </button>
          <button className="toolbar-btn" onClick={() => exportJson(favorites)}>
            <IconDownload /> JSON
          </button>
          <button className="toolbar-btn" onClick={shareLink}>
            {copiedUrl ? <IconCheck /> : <IconLink />} Share link
          </button>
        </div>
      </header>

      <section className="results-grid">
        {favorites.map((f) => (
          <NameCard
            key={f.name}
            result={f}
            isFavorite
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </section>
    </div>
  )
}
