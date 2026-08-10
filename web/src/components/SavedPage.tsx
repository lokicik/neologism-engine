import { useState } from 'react'
import type { NameResult } from '../lib/engine'
import { exportText, exportJson, encodeShareUrl } from '../lib/share'
import type { SavedNameEntry } from '../lib/taste-identity'
import { NameCard } from './NameCard'
import { IconCopy, IconCheck, IconDownload, IconLink } from './icons'

interface Props {
  entries: SavedNameEntry[]
  onRemoveSaved: (r: NameResult) => void
  onGoCreate: () => void
}

// Phase 47: Saved is a first-class page — large header, real icon toolbar,
// and the full NameCard experience for every saved name (Why, Availability,
// copy; unstarring removes it from the collection).
export function SavedPage({ entries, onRemoveSaved, onGoCreate }: Props) {
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const favorites = entries.map((entry) => entry.result)

  function provenance(entry: SavedNameEntry): string {
    if (entry.explicitLikes === 0) return 'Saved from a shared link · not taste evidence'
    const sources: string[] = []
    if (entry.scopedProjects > 0) {
      sources.push(`liked in ${entry.scopedProjects} project${entry.scopedProjects === 1 ? '' : 's'}`)
    }
    if (entry.legacyLiked) sources.push('legacy unscoped like')
    const liked = sources.join(' · ')
    return entry.imported ? `${liked} · also received by share` : liked
  }

  function remove(entry: SavedNameEntry) {
    const sourceCount = entry.explicitLikes + Number(entry.imported)
    if (sourceCount > 1) {
      const liked = entry.explicitLikes === 0
        ? ''
        : `${entry.explicitLikes} explicit like${entry.explicitLikes === 1 ? '' : 's'}`
      const shared = entry.imported ? `${liked ? ' and ' : ''}its shared copy` : ''
      if (!window.confirm(
        `Remove ${entry.result.name} from Saved everywhere? This removes ${liked}${shared}. Passes are kept.`,
      )) return
    }
    onRemoveSaved(entry.result)
  }

  function copyAll() {
    const text = favorites.map((f) => f.name).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 1500)
    })
  }

  function shareLink() {
    try {
      const url = encodeShareUrl(favorites)
      navigator.clipboard.writeText(url).then(() => {
        setCopiedUrl(true)
        setTimeout(() => setCopiedUrl(false), 1500)
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not create the share link.')
    }
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
        {entries.map((entry) => (
          <NameCard
            key={entry.result.name.toLowerCase()}
            result={entry.result}
            isFavorite
            onToggleFavorite={() => remove(entry)}
            favoriteAction="saved"
            collectionNote={provenance(entry)}
            metricsAvailable={entry.explicitLikes > 0}
          />
        ))}
      </section>
    </div>
  )
}
