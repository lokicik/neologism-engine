import type { NameResult } from '../lib/engine'

interface Props {
  favorites: NameResult[]
  onRemove: (r: NameResult) => void
}

export function Favorites({ favorites, onRemove }: Props) {
  if (favorites.length === 0) return null

  return (
    <aside className="favorites-panel">
      <h2 className="favorites-heading">★ Saved names</h2>
      <ul className="favorites-list">
        {favorites.map((f) => (
          <li key={f.name} className="favorites-item">
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
