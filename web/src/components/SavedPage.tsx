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
  const [removalStatus, setRemovalStatus] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const goCreateRef = useRef<HTMLButtonElement>(null)
  const pendingRemovalFocusRef = useRef<number | null>(null)
  const copyStatusTimer = useRef<number | undefined>(undefined)
  const copiedAllTimer = useRef<number | undefined>(undefined)
  const copiedUrlTimer = useRef<number | undefined>(undefined)
  const savedActionRun = useRef(0)
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
    savedActionRun.current++
    if (copyStatusTimer.current !== undefined) clearTimeout(copyStatusTimer.current)
    if (copiedAllTimer.current !== undefined) clearTimeout(copiedAllTimer.current)
    if (copiedUrlTimer.current !== undefined) clearTimeout(copiedUrlTimer.current)
  }, [])

  function announceSavedAction(message: string) {
    if (copyStatusTimer.current !== undefined) clearTimeout(copyStatusTimer.current)
    setCopyStatus(message)
    copyStatusTimer.current = window.setTimeout(() => setCopyStatus(''), 3000)
  }

  function downloadSaved(format: 'TXT' | 'JSON') {
    savedActionRun.current++
    if (copyStatusTimer.current !== undefined) clearTimeout(copyStatusTimer.current)
    setCopyStatus('')
    setCopyError(null)
    try {
      if (format === 'TXT') exportText(favorites)
      else exportJson(favorites)
      announceSavedAction(`${format} download started.`)
    } catch {
      setCopyStatus('')
      setCopyError(`Could not start the ${format} download.`)
    }
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
    setRemovalStatus('')
    if (!onRemoveSaved(entry.result)) return
    if (keyboard) pendingRemovalFocusRef.current = index
    const remaining = entries.length - 1
    setRemovalStatus(
      `${entry.result.name} removed from Saved. ${remaining} saved name${remaining === 1 ? '' : 's'} remain${remaining === 1 ? 's' : ''}.`,
    )
  }

  const removalStatusRegion = (
    <div
      className="visually-hidden saved-removal-status"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {removalStatus}
    </div>
  )

  async function copyAll() {
    const run = ++savedActionRun.current
    const text = favorites.map((f) => f.name).join('\n')
    if (copyStatusTimer.current !== undefined) clearTimeout(copyStatusTimer.current)
    setCopyStatus('')
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(text)
      if (savedActionRun.current !== run) return
      if (copiedAllTimer.current !== undefined) clearTimeout(copiedAllTimer.current)
      setCopiedAll(true)
      announceSavedAction('Saved names copied to clipboard.')
      copiedAllTimer.current = window.setTimeout(() => setCopiedAll(false), 1500)
    } catch {
      if (savedActionRun.current !== run) return
      if (copiedAllTimer.current !== undefined) clearTimeout(copiedAllTimer.current)
      setCopiedAll(false)
      setCopyStatus('')
      setCopyError('Could not copy the Saved names. Browser clipboard access was denied.')
    }
  }

  async function shareLink() {
    const run = ++savedActionRun.current
    if (copyStatusTimer.current !== undefined) clearTimeout(copyStatusTimer.current)
    setCopyStatus('')
    setCopyError(null)
    let url: string
    try {
      url = encodeShareUrl(favorites)
    } catch (error) {
      if (savedActionRun.current !== run) return
      if (copiedUrlTimer.current !== undefined) clearTimeout(copiedUrlTimer.current)
      setCopiedUrl(false)
      setCopyError(error instanceof Error ? error.message : 'Could not create the share link.')
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      if (savedActionRun.current !== run) return
      if (copiedUrlTimer.current !== undefined) clearTimeout(copiedUrlTimer.current)
      setCopiedUrl(true)
      announceSavedAction('Share link copied to clipboard.')
      copiedUrlTimer.current = window.setTimeout(() => setCopiedUrl(false), 1500)
    } catch {
      if (savedActionRun.current !== run) return
      if (copiedUrlTimer.current !== undefined) clearTimeout(copiedUrlTimer.current)
      setCopiedUrl(false)
      setCopyStatus('')
      setCopyError('Could not copy the share link. Browser clipboard access was denied.')
    }
  }

  if (favorites.length === 0) {
    return (
      <div className="saved-page" ref={rootRef}>
        {removalStatusRegion}
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
      {removalStatusRegion}
      <header className="page-header">
        <h1 className="page-title">
          Saved names <span className="count-pill">{favorites.length}</span>
        </h1>
        <div className="page-toolbar">
          <button className="toolbar-btn" onClick={() => void copyAll()}>
            {copiedAll ? <IconCheck /> : <IconCopy />} Copy all
          </button>
          <button className="toolbar-btn" onClick={() => downloadSaved('TXT')}>
            <IconDownload /> TXT
          </button>
          <button className="toolbar-btn" onClick={() => downloadSaved('JSON')}>
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
