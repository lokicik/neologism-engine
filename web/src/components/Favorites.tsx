import { useState } from 'react'
import type { NameResult } from '../lib/engine'
import { composite } from '../lib/score'
import { Monogram } from './Monogram'
import { IconCopy, IconCheck, IconX } from './icons'
import { exportText, exportJson, encodeShareUrl } from '../lib/share'

interface Props {
  favorites: NameResult[]
  onRemove: (r: NameResult) => void
  /// Rendered as a ✕ in the header when provided (drawer context).
  onClose?: () => void
}

// Phase 46: proper drawer anatomy — header (title + count + close), scrollable
// body of rich rows with hover-revealed actions, fixed footer with the
// contextual actions (PatternFly/Pajamas drawer guidance; wishlist pattern).
export function Favorites({ favorites, onRemove, onClose }: Props) {
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedRow, setCopiedRow] = useState<string | null>(null)

  if (favorites.length === 0) return null

  function copyAll() {
    const text = favorites.map((f) => f.name).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 1500)
    })
  }

  function copyOne(name: string) {
    navigator.clipboard.writeText(name).then(() => {
      setCopiedRow(name)
      setTimeout(() => setCopiedRow(null), 1500)
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
      <div className="drawer-header">
        <h2 className="favorites-heading">
          Saved <span className="count-pill">{favorites.length}</span>
        </h2>
        {onClose && (
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconX />
          </button>
        )}
      </div>

      <ul className="favorites-list">
        {favorites.map((f) => {
          const score = composite(f)
          return (
            <li key={f.name} className="fav-row">
              <Monogram name={f.name} size={28} />
              <span className="fav-name">{f.name}</span>
              {f.style !== 'big_tech' && (
                <span className="fav-style">{f.style.replace('_', ' ')}</span>
              )}
              {score > 0 && <span className="fav-score">★ {score}</span>}
              <span className="fav-row-actions">
                <button
                  className="icon-btn"
                  onClick={() => copyOne(f.name)}
                  title="Copy name"
                >
                  {copiedRow === f.name ? <IconCheck /> : <IconCopy />}
                </button>
                <button className="icon-btn" onClick={() => onRemove(f)} title="Remove">
                  <IconX />
                </button>
              </span>
            </li>
          )
        })}
      </ul>

      <div className="drawer-footer">
        <button className="fav-primary" onClick={copyAll}>
          {copiedAll ? '✓ Copied' : 'Copy all names'}
        </button>
        <div className="fav-links">
          <button className="fav-link" onClick={() => exportText(favorites)} title="Download as .txt">
            ↓ TXT
          </button>
          <span className="fav-link-dot">·</span>
          <button className="fav-link" onClick={() => exportJson(favorites)} title="Download as .json">
            ↓ JSON
          </button>
          <span className="fav-link-dot">·</span>
          <button className="fav-link" onClick={shareLink} title="Copy a share link">
            {copiedUrl ? '✓ Copied' : '↗ Share'}
          </button>
        </div>
      </div>
    </aside>
  )
}
