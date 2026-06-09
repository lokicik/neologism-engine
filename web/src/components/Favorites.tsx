import { useState } from 'react'
import type { NameResult } from '../lib/engine'
import { Monogram } from './Monogram'
import { exportText, exportJson, encodeShareUrl } from '../lib/share'

interface Props {
  favorites: NameResult[]
  onRemove: (r: NameResult) => void
}

export function Favorites({ favorites, onRemove }: Props) {
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)

  if (favorites.length === 0) return null

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

  return (
    <aside className="favorites-panel">
      <div className="favorites-header">
        <h2 className="favorites-heading">★ Saved names</h2>
        <div className="favorites-toolbar">
          <button className="icon-btn fav-toolbar-btn" onClick={copyAll} title="Copy all names">
            {copiedAll ? '✓' : '⎘'} Copy all
          </button>
          <button className="icon-btn fav-toolbar-btn" onClick={() => exportText(favorites)} title="Export as text">
            ↓ TXT
          </button>
          <button className="icon-btn fav-toolbar-btn" onClick={() => exportJson(favorites)} title="Export as JSON">
            ↓ JSON
          </button>
          <button className="icon-btn fav-toolbar-btn" onClick={shareLink} title="Copy share URL">
            {copiedUrl ? '✓ Copied!' : '↗ Share'}
          </button>
        </div>
      </div>
      <ul className="favorites-list">
        {favorites.map((f) => (
          <li key={f.name} className="favorites-item">
            <Monogram name={f.name} size={28} />
            <span className="fav-name">{f.name}</span>
            <span className="fav-style">{f.style.replace('_', ' ')}</span>
            <button
              className="icon-btn"
              onClick={() => onRemove(f)}
              title="Remove"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
