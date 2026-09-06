import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { NameResult } from '../lib/engine'
import { exportText, exportJson, encodeShareUrl } from '../lib/share'
import { normalizedName, type SavedNameEntry } from '../lib/taste-identity'
import { DiscoveryCard } from './DiscoveryCard'
import { NameDetails } from './NameDetails'
import { NameComparison } from './NameComparison'

interface Props {
  entries: SavedNameEntry[]
  onRemoveSaved: (result: NameResult) => boolean
  onGoCreate: (keyboard: boolean) => void
  undoName: string | null
  onUndo: () => string
  onDismissUndo: () => void
}

export function SavedPage({ entries, onRemoveSaved, onGoCreate, undoName, onUndo, onDismissUndo }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)
  const [detail, setDetail] = useState<SavedNameEntry | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const goCreate = useRef<HTMLButtonElement>(null)
  const exports = useRef<HTMLDetailsElement>(null)
  const actionRun = useRef(0)
  const removalFocus = useRef<number | null>(null)
  const names = entries.map(entry => entry.result)
  const visible = entries.filter(entry => normalizedName(entry.result).includes(query.trim().toLowerCase().normalize('NFC')))
  const chosen = entries.filter(entry => selected.includes(normalizedName(entry.result)))

  useEffect(() => () => { actionRun.current++ }, [])
  useEffect(() => { setSelected(current => current.filter(name => entries.some(entry => normalizedName(entry.result) === name))) }, [entries])
  useLayoutEffect(() => {
    if (removalFocus.current === null) return
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>('.saved-grid .save-name')
    const target = buttons?.length ? buttons[Math.min(removalFocus.current, buttons.length - 1)] : search.current ?? goCreate.current
    removalFocus.current = null
    target?.focus({ preventScroll: true })
  }, [entries])

  function remove(entry: SavedNameEntry) {
    setError(null)
    if (!onRemoveSaved(entry.result)) { setError(`Could not remove ${entry.result.name} completely. Saved was refreshed to match stored data. Try again.`); return }
    removalFocus.current = Math.max(0, visible.indexOf(entry))
    setDetail(null)
    setStatus(`${entry.result.name} removed from Saved.`)
  }
  function select(entry: SavedNameEntry) {
    const name = normalizedName(entry.result)
    if (selected.includes(name)) setSelected(selected.filter(value => value !== name))
    else if (selected.length < 4) setSelected([...selected, name])
    setStatus('')
  }
  async function copy(kind: 'names' | 'link') {
    const run = ++actionRun.current
    setError(null); setStatus('')
    try {
      const text = kind === 'link' ? encodeShareUrl(names) : names.map(item => item.name).join('\n')
      await navigator.clipboard.writeText(text)
      if (run !== actionRun.current) return
      setStatus(kind === 'link' ? 'Share link copied.' : 'All saved names copied.')
      if (exports.current) exports.current.open = false
    } catch (cause) {
      if (run === actionRun.current) setError(cause instanceof Error ? cause.message : 'Could not copy. Browser clipboard access may be disabled.')
    }
  }
  function download(format: 'TXT' | 'JSON') {
    actionRun.current++; setError(null)
    try {
      if (format === 'TXT') exportText(names); else exportJson(names)
      setStatus(`${format} download started.`)
      if (exports.current) exports.current.open = false
    } catch { setError(`Could not start the ${format} download.`) }
  }
  function provenance(entry: SavedNameEntry) {
    if (!entry.explicitLikes) return 'From a shared link'
    if (entry.explicitLikes > 1) return `Saved in ${entry.explicitLikes} contexts${entry.imported ? ' · also shared' : ''}`
    return entry.imported ? 'Saved here · also shared' : null
  }

  return <section className="saved-page" ref={root} aria-labelledby="saved-title">
    <div className="page-intro"><h1 id="saved-title">Saved names</h1><p>Keep your favourites close. Compare two to four when you’re ready.</p></div>
    {undoName && <div className="saved-undo"><span>{undoName} removed.</span><button className="quiet-button" onClick={() => setStatus(onUndo())}>Undo</button><button className="undo-dismiss" aria-label="Dismiss undo" onClick={onDismissUndo}>Dismiss</button></div>}
    {status && <p className="saved-action-status" role="status">{status}</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    {entries.length > 0 ? <>
      <div className="saved-toolbar">
        <label className="saved-search"><span className="visually-hidden">Search saved names</span><input ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search saved names" /></label>
        <button className="compare-button" disabled={chosen.length < 2} aria-haspopup="dialog" onClick={() => setComparing(true)}>Compare{chosen.length > 0 ? ` (${chosen.length})` : ''}</button>
        <details className="saved-export" ref={exports} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() } }}>
          <summary>Export</summary><div className="export-menu"><button onClick={() => void copy('names')}>Copy all names</button><button onClick={() => download('TXT')}>Download TXT</button><button onClick={() => download('JSON')}>Download JSON</button><button onClick={() => void copy('link')}>Copy share link</button></div>
        </details>
      </div>
      <div className="saved-selection-note"><span>{visible.length} of {entries.length} saved names</span><span id="comparison-limit">{chosen.length === 4 ? 'Four selected. Deselect one to choose another.' : 'Select 2–4 names to compare.'}</span>{chosen.length > 0 && <button onClick={() => setSelected([])}>Clear selection</button>}</div>
      {visible.length ? <div className="discovery-grid saved-grid">{visible.map(entry => <div className="saved-item" key={normalizedName(entry.result)}>
        <label className="compare-select"><input type="checkbox" checked={selected.includes(normalizedName(entry.result))} disabled={chosen.length === 4 && !selected.includes(normalizedName(entry.result))} onChange={() => select(entry)} aria-label={`Compare ${entry.result.name}`} aria-describedby="comparison-limit" /><span>Compare</span></label>
        <DiscoveryCard result={entry.result} saved remove onSave={() => remove(entry)} onDetails={() => setDetail(entry)} />
        {provenance(entry) && <p className="saved-provenance">{provenance(entry)}</p>}
      </div>)}</div> : <div className="saved-empty"><p>No saved names match “{query}”.</p><button className="quiet-button" onClick={() => { setQuery(''); search.current?.focus() }}>Clear search</button></div>}
    </> : <div className="saved-empty"><p>Save a name while exploring. It will be here when you come back.</p><button ref={goCreate} className="quiet-button" onClick={event => onGoCreate(event.detail === 0)}>Explore names</button></div>}
    {detail && <NameDetails result={detail.result} saved imported={!detail.explicitLikes} onSave={() => remove(detail)} onClose={() => setDetail(null)} />}
    {comparing && chosen.length >= 2 && <NameComparison entries={chosen} onClose={() => setComparing(false)} />}
  </section>
}
