import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { NameResult } from '../lib/engine'
import { exportText, exportJson, encodeShareUrl } from '../lib/share'
import type { SavedNameEntry } from '../lib/taste-identity'
import { NameCard } from './NameCard'
import { IconCopy, IconCheck, IconDownload, IconLink } from './icons'

interface Props {
  entries: SavedNameEntry[]
  onRemoveSaved: (r: NameResult) => boolean
  onGoCreate: (keyboard: boolean) => void
}

// Phase 47: Saved is a first-class page — large header, real icon toolbar,
// and the full NameCard experience for every saved name (Why, Availability,
// copy; unstarring removes it from the collection).
export function SavedPage({ entries, onRemoveSaved, onGoCreate }: Props) {
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [copyError, setCopyError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const goCreateRef = useRef<HTMLButtonElement>(null)
  const pendingRemovalFocusRef = useRef<number | null>(null)
  const copyStatusTimer = useRef<number | undefined>(undefined)
  const favorites = entries.map((entry) => entry.result)

  useLayoutEffect(() => {
    const index = pendingRemovalFocusRef.current
    if (index === null) return
    pendingRemovalFocusRef.current = null
    const removeButtons = rootRef.current?.querySelectorAll<HTMLButtonElement>('.star-btn') ?? []
    const target = removeButtons.length > 0
      ? removeButtons[Math.min(index, removeButtons.length - 1)]
      : goCreateRef.current
    target?.focus()
  }, [entries])

  useEffect(() => () => {
    if (copyStatusTimer.current !== undefined) clearTimeout(copyStatusTimer.current)
  }, [])

  function announceCopy(message: string) {
    if (copyStatusTimer.current !== undefined) clearTimeout(copyStatusTimer.current)
    setCopyStatus(message)
    copyStatusTimer.current = window.setTimeout(() => setCopyStatus(''), 3000)
  }

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

  function remove(entry: SavedNameEntry, keyboard = false) {
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
    const index = entries.indexOf(entry)
    if (onRemoveSaved(entry.result) && keyboard) pendingRemovalFocusRef.current = index
  }

  async function copyAll() {
    const text = favorites.map((f) => f.name).join('\n')
    if (copyStatusTimer.current !== undefined) clearTimeout(copyStatusTimer.current)
    setCopyStatus('')
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAll(true)
      announceCopy('Saved names copied to clipboard.')
      setTimeout(() => setCopiedAll(false), 1500)
    } catch {
      setCopiedAll(false)
      setCopyStatus('')
      setCopyError('Could not copy the Saved names. Browser clipboard access was denied.')
    }
  }

  async function shareLink() {
    if (copyStatusTimer.current !== undefined) clearTimeout(copyStatusTimer.current)
    setCopyStatus('')
    setCopyError(null)
    let url: string
    try {
      url = encodeShareUrl(favorites)
    } catch (error) {
      setCopiedUrl(false)
      setCopyError(error instanceof Error ? error.message : 'Could not create the share link.')
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(true)
      announceCopy('Share link copied to clipboard.')
      setTimeout(() => setCopiedUrl(false), 1500)
    } catch {
      setCopiedUrl(false)
      setCopyStatus('')
      setCopyError('Could not copy the share link. Browser clipboard access was denied.')
    }
  }

  if (favorites.length === 0) {
    return (
      <div className="saved-page" ref={rootRef}>
        <header className="page-header">
          <h1 className="page-title">Saved names</h1>
        </header>
        <div className="empty-state">
          <p>Nothing saved yet — star names you like while generating.</p>
          <div className="example-chips">
            <button ref={goCreateRef} className="example-chip" onClick={(event) => onGoCreate(event.detail === 0)}>
              ✦ Go create
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="saved-page" ref={rootRef}>
      <header className="page-header">
        <h1 className="page-title">
          Saved names <span className="count-pill">{favorites.length}</span>
        </h1>
        <div className="page-toolbar">
          <button className="toolbar-btn" onClick={() => void copyAll()}>
            {copiedAll ? <IconCheck /> : <IconCopy />} Copy all
          </button>
          <button className="toolbar-btn" onClick={() => exportText(favorites)}>
            <IconDownload /> TXT
          </button>
          <button className="toolbar-btn" onClick={() => exportJson(favorites)}>
            <IconDownload /> JSON
          </button>
          <button className="toolbar-btn" onClick={() => void shareLink()}>
            {copiedUrl ? <IconCheck /> : <IconLink />} Share link
          </button>
        </div>
      </header>

      {copyError && <p className="saved-copy-error" role="alert">{copyError}</p>}
      <p
        className="visually-hidden saved-copy-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {copyStatus}
      </p>

      <section className="results-grid">
        {entries.map((entry) => (
          <NameCard
            key={entry.result.name.toLowerCase()}
            result={entry.result}
            isFavorite
            onToggleFavorite={(_result, keyboard) => remove(entry, keyboard)}
            favoriteAction="saved"
            collectionNote={provenance(entry)}
            metricsAvailable={entry.explicitLikes > 0}
          />
        ))}
      </section>
    </div>
  )
}
