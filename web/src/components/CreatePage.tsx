import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import type { Config, NameResult } from '../lib/engine'
import { DEFAULT_CONFIG, copyConfig, generateDiscoveryPage, randomSeed } from '../lib/discovery-generation'
import { configIdentity, readDiscovery, writeDiscovery, type DiscoverySession } from '../lib/discovery-session'
import { loadRecent, RECENT_WINDOW, saveRecent } from '../lib/storage'
import { normalizedName, tasteIdentity } from '../lib/taste-identity'
import { CommandBar } from './CommandBar'
import { DiscoveryCard } from './DiscoveryCard'
import { NameDetails } from './NameDetails'

export interface CreatePageHandle { leave: () => void }
interface Props {
  active: boolean; paused: boolean; sessionRef: Ref<CreatePageHandle>
  favorites: NameResult[]; rejected: NameResult[]; references: string; referenceError: string | null
  onReferencesChange: (value: string) => boolean
  onFavorite: (result: NameResult) => void; onRejected: (result: NameResult) => void
}

export function CreatePage(props: Props) {
  const { active, paused: externalPaused, favorites, rejected, references, referenceError, onReferencesChange, onFavorite, onRejected, sessionRef } = props
  const [detail, setDetail] = useState<NameResult | null>(null)
  const paused = externalPaused || detail !== null
  const [initial] = useState(() => {
    try { return readDiscovery(sessionStorage) }
    catch { return { session: null, error: 'Your browser has disabled session storage. Reloading may lose this discovery.' } }
  })
  const [config, setConfig] = useState<Config>(() => copyConfig(initial.session?.config ?? DEFAULT_CONFIG))
  const [committed, setCommitted] = useState<Config>(() => copyConfig(initial.session?.generationConfig ?? DEFAULT_CONFIG))
  const [results, setResults] = useState<NameResult[]>(initial.session?.results ?? [])
  const [exhausted, setExhausted] = useState(initial.session?.exhausted ?? false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState(initial.error)
  const [historyWarning, setHistoryWarning] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const snapshot = useRef<DiscoverySession>({ schema: 1, config, generationConfig: committed, results, salt: initial.session?.salt ?? null, exhausted, scrollY: initial.session?.scrollY ?? 0 })
  const recent = useRef(loadRecent())
  const inFlight = useRef(false)
  const ticket = useRef(0)
  const started = useRef(results.length > 0 || exhausted)
  const sentinel = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = { ...props, paused }
  snapshot.current = { ...snapshot.current, config, generationConfig: committed, results, exhausted }
  const dirty = configIdentity(config) !== configIdentity(committed)
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty
  const errorRef = useRef(error); errorRef.current = error

  const persist = useCallback(() => {
    try { const failure = writeDiscovery(sessionStorage, snapshot.current); if (failure) setWarning(failure) }
    catch { setWarning('Your browser could not save this discovery. Reloading may lose this list.') }
  }, [])
  const cancel = useCallback(() => {
    ticket.current++; inFlight.current = false; setLoading(false)
    if (!snapshot.current.results.length && !snapshot.current.exhausted) started.current = false
  }, [])
  const leave = useCallback(() => { snapshot.current.scrollY = window.scrollY; persist(); cancel(); setDetail(null) }, [persist, cancel])
  useImperativeHandle(sessionRef, () => ({ leave }), [leave])

  const generate = useCallback(async (append: boolean, focus = false, override?: Config) => {
    if (inFlight.current || !latest.current.active || latest.current.paused) return
    const request = ++ticket.current
    inFlight.current = true; setLoading(true); setError(null); setStatus('')
    const cfg = copyConfig(append ? snapshot.current.generationConfig : override ?? snapshot.current.config)
    const seed = cfg.seed ?? randomSeed()
    const salt = append && snapshot.current.salt !== null ? snapshot.current.salt : seed
    try {
      const batch = await generateDiscoveryPage(cfg, { favorites: latest.current.favorites, rejected: latest.current.rejected, references: latest.current.references, recent: recent.current, seed, salt, append })
      if (request !== ticket.current || !latest.current.active || latest.current.paused) return
      const seen = new Set((append ? snapshot.current.results : []).map(normalizedName))
      const unique = batch.filter(item => { const key = normalizedName(item); if (seen.has(key)) return false; seen.add(key); return true }).slice(0, 10)
      const start = append ? snapshot.current.results.length : 0
      const shown = append ? [...snapshot.current.results, ...unique] : unique
      snapshot.current = { ...snapshot.current, results: shown, generationConfig: cfg, salt, exhausted: unique.length === 0 }
      setResults(shown); setCommitted(cfg); setExhausted(unique.length === 0)
      recent.current = [...recent.current, ...unique.map(item => item.name)].slice(-RECENT_WINDOW)
      if (!saveRecent(recent.current)) setHistoryWarning('Seen-name history could not be saved. This discovery will still avoid repeats.')
      setStatus(unique.length ? `${unique.length} new names. ${shown.length} names in this discovery.` : 'No more names with these options.')
      persist()
      if (focus && unique.length) requestAnimationFrame(() => { const first = document.getElementById(`discovery-name-${start}`); first?.focus({ preventScroll: true }); first?.scrollIntoView({ block: 'start' }) })
    } catch {
      if (request === ticket.current && latest.current.active) setError('Could not generate names. Your current list is safe. Try again.')
    } finally {
      if (request === ticket.current) { inFlight.current = false; setLoading(false) }
    }
  }, [persist])

  useEffect(() => {
    if (!active || paused || started.current) return
    const frame = requestAnimationFrame(() => { started.current = true; void generate(false, false, snapshot.current.generationConfig) })
    return () => cancelAnimationFrame(frame)
  }, [active, paused, generate])
  useEffect(() => { if (paused || !active) cancel() }, [active, paused, cancel])
  useEffect(() => { persist() }, [config, committed, results, exhausted, persist])
  useLayoutEffect(() => {
    if (!active) return
    const y = snapshot.current.scrollY
    const frame = requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }))
    return () => cancelAnimationFrame(frame)
  }, [active])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const scroll = () => {
      if (!latest.current.active || latest.current.paused) return
      snapshot.current.scrollY = window.scrollY
      clearTimeout(timer); timer = setTimeout(persist, 180)
    }
    const flush = () => { if (latest.current.active && !latest.current.paused) snapshot.current.scrollY = window.scrollY; persist() }
    addEventListener('scroll', scroll, { passive: true }); addEventListener('pagehide', flush)
    return () => { clearTimeout(timer); removeEventListener('scroll', scroll); removeEventListener('pagehide', flush); ticket.current++ }
  }, [persist])
  useEffect(() => {
    if (!active || paused || dirty || error || exhausted || !results.length) return
    let userIntent = false
    let previousY = window.scrollY
    const more = () => {
      if (!userIntent || inFlight.current || dirtyRef.current || errorRef.current || !latest.current.active || latest.current.paused || snapshot.current.exhausted) return
      const rect = sentinel.current?.getBoundingClientRect()
      if (rect && rect.top <= innerHeight + 300) { userIntent = false; void generate(true) }
    }
    const wheel = (event: WheelEvent) => { if (event.deltaY > 0 && !inFlight.current) userIntent = true }
    const touch = () => { if (!inFlight.current) userIntent = true }
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) return
      if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key) && !inFlight.current) userIntent = true
    }
    const scroll = () => { const y = window.scrollY; if (y > previousY + 2) more(); previousY = y }
    const observer = new IntersectionObserver(more, { rootMargin: '300px 0px' })
    if (sentinel.current) observer.observe(sentinel.current)
    addEventListener('wheel', wheel, { passive: true }); addEventListener('touchmove', touch, { passive: true }); addEventListener('keydown', key); addEventListener('scroll', scroll, { passive: true })
    return () => { observer.disconnect(); removeEventListener('wheel', wheel); removeEventListener('touchmove', touch); removeEventListener('keydown', key); removeEventListener('scroll', scroll) }
  }, [active, paused, dirty, error, exhausted, results.length, generate])

  const append = results.length > 0 && !dirty
  return <section hidden={!active} className="create-page" aria-labelledby="create-title">
    <div className="page-intro"><h1 id="create-title">Find your next name.</h1><p>Explore a mix of names. Save the ones worth another look.</p></div>
    <CommandBar config={config} onChange={next => setConfig({ ...next, style: 'big_tech', variant: 'auto', compound: false, count: 10 })} loading={loading} exhausted={exhausted && !dirty} buttonLabel={append ? 'More names' : 'Generate'} onGenerate={() => void generate(append, true)} tasteReferences={references} tasteReferenceError={referenceError} onTasteReferencesChange={onReferencesChange} />
    {(warning || historyWarning) && <p className="session-warning" role="status">{warning || historyWarning}</p>}
    {dirty && results.length > 0 && <p className="draft-note">Your changes are ready. Generate to start a new discovery.</p>}
    {error && <div className="error-banner" role="alert"><p>{error}</p><button className="quiet-button" onClick={() => void generate(append, true)}>Retry</button></div>}
    <div className="discovery-meta"><span>{results.length ? `${results.length} names to explore` : loading ? 'Finding your first names…' : 'Your discovery'}</span><span>Generated on this device</span></div>
    <p className="visually-hidden create-results-status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
    <div className="results-grid discovery-grid" aria-busy={loading}>
      {results.map((result, index) => <div id={`discovery-name-${index}`} className="discovery-item" tabIndex={-1} aria-label={result.name} key={normalizedName(result)}><DiscoveryCard result={result} saved={favorites.some(item => tasteIdentity(item) === tasteIdentity(result))} onSave={onFavorite} onDetails={result => { cancel(); setDetail(result) }} /></div>)}
      {loading && results.length === 0 && Array.from({ length: 10 }, (_, index) => <div className="skeleton-card" key={index} aria-hidden="true" />)}
    </div>
    <div ref={sentinel} className="scroll-sentinel" aria-hidden="true" />
    {exhausted && !dirty ? <p className="exhausted-notice" role="status">No more names with these options. Try a different brief or a wider length.</p> : results.length > 0 && <button className="load-more" disabled={loading || dirty} aria-busy={loading} onClick={() => void generate(true, true)}>{loading ? 'Finding more names…' : 'Load more'}</button>}
    {detail && active && <NameDetails result={detail} saved={favorites.some(item => tasteIdentity(item) === tasteIdentity(detail))} rejected={rejected.some(item => tasteIdentity(item) === tasteIdentity(detail))} onSave={onFavorite} onRejected={onRejected} onClose={() => setDetail(null)} />}
  </section>
}
