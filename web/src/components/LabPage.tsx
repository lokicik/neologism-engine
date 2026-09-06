import { useEffect, useRef, useState } from 'react'
import { CommandBar } from './CommandBar'
import { CandidateLab, type LabRequest } from './CandidateLab'
import { ProductNamesLab } from './ProductNamesLab'
import { NameCard } from './NameCard'
import { DEFAULT_CONFIG, copyConfig, generateDiscoveryPage, randomSeed } from '../lib/discovery-generation'
import type { Config, NameResult } from '../lib/engine'
import { tasteIdentity } from '../lib/taste-identity'

const methods = [
  ['brandable', 'Brandable'], ['realword', 'Real words'], ['respell', 'Respelled'], ['compound', 'Compound'],
  ['seamblend', 'Seam blend'], ['morpheme', 'Morpheme'], ['submorph', 'Dense coinage'], ['reason', 'Reason'],
  ['shared_pool', 'Shared pool'], ['intent_pool', 'Brief intent'], ['relation_pool', 'Operation and object'],
  ['semantic_pool', 'Meaning first'], ['frame_pool', 'Product frame'], ['brief_pool', 'Product brief'],
  ['retained_pool', 'Retained fragments'], ['product_names', 'Product names'],
] as const
type Method = typeof methods[number][0]
interface Props {
  favorites: NameResult[]; rejected: NameResult[]; references: string; referenceError: string | null
  onReferencesChange: (value: string) => boolean
  onFavorite: (result: NameResult) => void; onRejected: (result: NameResult) => void
}

export function LabPage({ favorites, rejected, references, referenceError, onReferencesChange, onFavorite, onRejected }: Props) {
  const [method, setMethod] = useState<Method>('brandable')
  const [config, setConfig] = useState<Config>({ ...DEFAULT_CONFIG, variant: undefined })
  const [request, setRequest] = useState<LabRequest | null>(null)
  const [results, setResults] = useState<NameResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState(false)
  const run = useRef(0)
  const working = useRef(false)
  const session = useRef<Config | null>(null)
  const seed = useRef(randomSeed())
  const pool = method.endsWith('_pool')
  const experimental = pool || method === 'product_names'
  useEffect(() => () => { run.current++; working.current = false }, [])
  function select(value: Method) {
    run.current++; working.current = false; setBusy(false); setRequest(null); setResults([]); setError(null); setExhausted(false); session.current = null
    setMethod(value)
    setConfig(current => ({ ...current, compound: value === 'compound', variant: value === 'brandable' || value === 'compound' ? undefined : value }))
  }
  async function generate(append = false) {
    if (working.current || busy) return
    if (experimental) { setRequest({ id: ++run.current, config: { ...copyConfig(config), seed: randomSeed() } }); return }
    const token = ++run.current
    working.current = true; setBusy(true); setError(null)
    const input = copyConfig(append && session.current ? session.current : config)
    if (!append) seed.current = randomSeed()
    try {
      const batch = await generateDiscoveryPage(input, { favorites, rejected, references, recent: append ? results.map(result => result.name) : [], seed: randomSeed(), salt: seed.current, append })
      if (token !== run.current) return
      session.current = input; setResults(current => append ? [...current, ...batch] : batch); setExhausted(batch.length === 0)
    } catch { if (token === run.current) setError('Could not generate this batch. Try Generate again.') }
    finally { if (token === run.current) { working.current = false; setBusy(false) } }
  }
  return <section className="lab-page" aria-labelledby="lab-title">
    <div className="page-intro"><h1 id="lab-title">Naming lab</h1><p>Explore individual methods and inspect their evidence.</p></div>
    <label className="lab-method">Method<select value={method} onChange={event => select(event.target.value as Method)}>{methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <CommandBar config={config} onChange={setConfig} loading={busy} onGenerate={() => void generate()} tasteReferences={references} tasteReferenceError={referenceError} onTasteReferencesChange={onReferencesChange} />
    {method === 'realword' && <p className="muted">Real words use a curated pool. Your brief does not affect this method.</p>}
    {method === 'product_names' ? <ProductNamesLab request={request} onBusy={setBusy} /> : pool ? <CandidateLab key={method} request={request} onBusy={setBusy} /> : <>
      {error && <p role="alert" className="error-banner">{error}</p>}
      <div className="results-grid">{results.map((result, index) => <NameCard key={index + result.name} result={result} isFavorite={favorites.some(item => tasteIdentity(item) === tasteIdentity(result))} onToggleFavorite={onFavorite} isRejected={rejected.some(item => tasteIdentity(item) === tasteIdentity(result))} onToggleRejected={onRejected} />)}</div>
      {results.length > 0 && !exhausted && <button className="load-more" disabled={busy} onClick={() => void generate(true)}>More names</button>}
      {exhausted && <p role="status">No more names with these settings. Try another brief or broader options.</p>}
    </>}
  </section>
}
