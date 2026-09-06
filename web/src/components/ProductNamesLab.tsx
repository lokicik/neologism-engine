import { useEffect, useRef, useState } from 'react'
import type { Config, Explanation, NameResult } from '../lib/engine'
import { generateConceptNames, collisionLabel, type ConceptRun, type NamingRequest } from '../lib/concept-naming'
import type { LabRequest } from './CandidateLab'
import { Shortlist } from './Shortlist'

const nameKey = (r: NameResult) => r.name.toLowerCase()
const copyConfig = (c: Config): Config => ({...c, roots: [...(c.roots ?? [])], exclude: [...(c.exclude ?? [])]})
export function ProductNamesLab({request, onBusy}: {request: LabRequest | null; onBusy: (busy: boolean) => void}) {
  const [run, setRun] = useState<ConceptRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [marks, setMarks] = useState<Record<string, 'keep' | 'pass'>>({})
  const ticket = useRef(0)
  const session = useRef<NamingRequest | null>(null)
  const seen = useRef<string[]>([])
  const history = useRef<ConceptRun[]>([])
  useEffect(() => {
    let live = true
    if (request) {
      session.current = {config: copyConfig(request.config), target: 'product_name'}
      seen.current = [...(request.config.exclude ?? [])]
      history.current = []
      setRun(null); setMarks({}); setShowAll(false)
      void generate(session.current, () => live)
    }
    return () => { live = false; ticket.current++; onBusy(false) }
    // Generate captures an immutable request; command-bar edits affect a new session only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  async function generate(input: NamingRequest, active = () => true) {
    const current = ++ticket.current
    setBusy(true); onBusy(true); setError(null)
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
    if (current !== ticket.current || !active()) return
    try {
      const result = await generateConceptNames(input)
      if (current !== ticket.current || !active()) return
      setRun(result); setShowAll(false)
      history.current.push(result)
      session.current = {...input, config: copyConfig(input.config), data_identity: result.data_identity}
      seen.current = [...new Set([...seen.current, ...result.finalists.map(f => f.id)])]
    } catch (failure) {
      if (current === ticket.current && active()) setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (current === ticket.current && active()) {setBusy(false); onBusy(false)}
    }
  }
  function continueWith(change: Partial<NamingRequest> = {}) {
    if (session.current) void generate({...session.current, ...change, config: {...copyConfig(session.current.config), exclude: [...seen.current]}})
  }
  function mark(r: NameResult, value: 'keep' | 'pass') {
    setMarks(old => { const next = {...old}; const id=nameKey(r); if (next[id] === value) delete next[id]; else next[id]=value; return next })
  }
  function toggleAll() {
    if (!showAll && run) seen.current = [...new Set([...seen.current, ...run.candidates.map(p => p.id)])]
    setShowAll(!showAll)
  }
  function download() {
    const url=URL.createObjectURL(new Blob([JSON.stringify({schema:'concept-naming-session-v1',runs:history.current,sessionChoices:marks},null,2)],{type:'application/json'}))
    const link=document.createElement('a'); link.href=url; link.download=`product-names-${run?.request.config.seed}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url),1000)
  }
  const finalists=run?.finalists.map(f => run.candidates.find(p => p.id === f.id)!) ?? []
  const sourceFor=(id: string) => {
    const f=run!.finalists.find(f => f.id === id)!
    return run!.candidates.find(p => p.id === id)!.sources.find(s => s.concept_id === f.concept_id)!
  }
  const explanations: Record<string,Explanation> = Object.fromEntries(finalists.map(p => [p.result.name, {
    suffix:null,stem:null,prefix_word:null,is_real_word:sourceFor(p.id).construction === 'whole_lexeme',
    syllables:p.result.syllables,connotations:p.result.connotations,score_pronounce:p.result.score_pronounce,
    score_novelty:p.result.score_novelty,score_memorability:p.result.score_memorability,
  }]))
  return <section className="canvas candidate-lab product-names-lab" aria-label="Product names Lab" aria-busy={busy} data-brief={run?.meaning.description}>
    <h2>Product names · Lab</h2>
    <p>Whole names connected to what your product does. Covers data migration and recovery, background jobs, observability, and configuration or artifact verification.</p>
    <p className="field-hint">Up to four names. Keep and Pass stay in this session. A preference advantage has not been established.</p>
    <p role="status">{busy ? 'Finding product names…' : run ? `${finalists.length} finalists from ${run.candidates.length} distinct names · seed ${run.request.config.seed}` : 'Describe your developer product and select Generate.'}</p>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {run && <>
      {run.meaning.job && <p><strong>Product interpretation:</strong> {run.meaning.job.label}.{run.meaning.interpretation_rule === 'user_override' ? ' Selected by you.' : ''}</p>}
      {run.meaning.status !== 'ready' && <p>{run.meaning.status === 'ambiguous' ? 'The description needs an interpretation before names can be proposed.' : 'This description does not match a supported product job.'} Choose an interpretation below or revise the description.</p>}
      <details open={run.meaning.status !== 'ready'} className="candidate-intent">
        <summary>{run.meaning.status === 'ready' ? 'Review product interpretation' : 'Choose product interpretation'}</summary>
        <label>Product job <select aria-label="Product interpretation" disabled={busy || !run.meaning.description.trim()} value={run.meaning.job?.id ?? ''} onChange={e => e.target.value && continueWith({interpretation_override:e.target.value,direction:null})}>
          <option value="">Select an interpretation</option>
          {run.meaning.options.map(job => <option key={job.id} value={job.id}>{job.label}</option>)}
        </select></label>
        {!!run.meaning.evidence_spans.length && <p>Matched text: {[...new Set(run.meaning.evidence_spans.map(s => s.surface))].join(' · ')}</p>}
      </details>
      {!!run.directions.length && <div className="concept-directions" aria-label="Naming direction">
        <button className="example-chip" disabled={busy} aria-pressed={!run.request.direction} onClick={() => continueWith({direction:null})}>All directions</button>
        {run.directions.map(d => <button className="example-chip" key={d.id} disabled={busy} aria-pressed={run.request.direction === d.id} onClick={() => continueWith({direction:d.id})}>{d.benefit}</button>)}
      </div>}
      <Shortlist finalists={finalists.map(p => p.result)} favoriteKeys={new Set(Object.keys(marks).filter(k => marks[k] === 'keep'))}
        rejectedKeys={new Set(Object.keys(marks).filter(k => marks[k] === 'pass'))} identityOf={nameKey}
        onToggleFavorite={r => mark(r,'keep')} onToggleRejected={r => mark(r,'pass')}
        totalCount={run.candidates.length} showingAll={showAll} onToggleAll={toggleAll}
        showStructuralScore={false} suppliedExplanations={explanations} useLegacyCollision={false}
        nameContexts={name => [{label:'Product',text:`Meet ${name}.`},{label:'In use',text:`We use ${name} for ${run.meaning.job?.object ?? 'our work'}.`}]}
        note="Different naming ideas, drawn from the product interpretation. Fewer eligible names means a shorter list."
        caseLabel={r => {const s=sourceFor(nameKey(r));return `${s.sense}. ${s.benefit}.`}}
        evidenceLabel={r => {const p=finalists.find(p => p.id === nameKey(r))!;return `${p.result.syllables} syllables · ${p.pronunciation.source === 'dictionary' ? 'dictionary pronunciation' : 'pronunciation estimated from complete components'}.`}}
        availabilityLabel={r => collisionLabel(finalists.find(p => p.id === nameKey(r))!)} />
      {run.exhausted && <p>No further eligible names in this direction under these constraints. Choose another direction or start a new brief.</p>}
      <div className="example-chips">
        <button className="example-chip" disabled={busy || !finalists.length} onClick={() => continueWith()}>Next finalists</button>
        {!finalists.length && !!run.candidates.length && <button className="example-chip" disabled={busy} onClick={toggleAll}>{showAll ? 'Hide pool' : 'Inspect pool'}</button>}
        <button className="example-chip" disabled={busy} onClick={download}>Export experiment</button>
      </div>
      {showAll && <div className="candidate-lab-table"><table>
        <caption>All catalog candidates and decisions</caption><thead><tr><th>Name</th><th>Meaning</th><th>Decision</th></tr></thead>
        <tbody>{run.candidates.map(p => <tr key={p.id}><td>{p.result.name}</td><td>{p.sources.map(s => s.sense).join('; ')}</td><td>{p.rejection ?? p.sources.find(s=>s.rejection)?.rejection ?? run.trace.find(t => t.stage === 'selection' && t.name === p.result.name)?.decision}</td></tr>)}</tbody>
      </table></div>}
      <details><summary>Evidence and generation details</summary>
        <p>Catalog {run.data_identity.slice(0,12)}. Associations are editorial and are not human preference labels. Snapshot dates are unknown; exact source hashes are included in the export.</p>
        <p>Product names and package identifiers are different uses. A crate record is shown as evidence, while an exact known-brand record is excluded. No live availability check is implied.</p>
      </details>
    </>}
  </section>
}
