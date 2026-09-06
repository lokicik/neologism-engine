import { useEffect, useRef, useState } from 'react'
import type { Config, NameResult } from '../lib/engine'
import { generateCandidatePool, type CandidatePoolRun } from '../lib/candidate-pool'
import { Shortlist } from './Shortlist'

export interface LabRequest { id: number; config: Config }
const key = (result: NameResult) => result.name.toLowerCase()

export function CandidateLab({ request, onBusy, intentMode = false }: { request: LabRequest | null; onBusy: (busy: boolean) => void; intentMode?: boolean }) {
  const [run, setRun] = useState<CandidatePoolRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [requireRelation, setRequireRelation] = useState(false)
  const [meaningFirst, setMeaningFirst] = useState(false)
  const [retainedFragments, setRetainedFragments] = useState(false)
  const [marks, setMarks] = useState<Record<string, 'keep' | 'pass'>>({})
  const ticket = useRef(0)
  const seen = useRef<string[]>([])
  const session = useRef<Config | null>(null)

  useEffect(() => {
    let live = true
    if (request) {
      const config = intentMode && meaningFirst ? { ...request.config, variant: retainedFragments ? 'retained_pool' : 'brief_pool' }
        : intentMode && requireRelation ? { ...request.config, variant: 'relation_pool' } : request.config
      session.current = config
      seen.current = [...(request.config.exclude ?? [])]
      setRun(null)
      setShowAll(false)
      void generate(config, () => live)
    }
    return () => { live = false; ticket.current++; onBusy(false) }
    // Requests are immutable snapshots. Editing the command bar cannot alter continuation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  async function generate(config: Config, active = () => true) {
    const current = ++ticket.current
    setBusy(true)
    onBusy(true)
    setError(null)
    // Paint the loading state before synchronous WASM work starts.
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    if (current !== ticket.current || !active()) return
    try {
      const result = await generateCandidatePool(config)
      if (current !== ticket.current || !active()) return
      setRun(result)
      setShowAll(false)
      seen.current = [...new Set([...seen.current, ...result.finalists.map((f) => f.result.name)])]
    } catch (failure) {
      if (current === ticket.current && active()) setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (current === ticket.current && active()) { setBusy(false); onBusy(false) }
    }
  }

  function mark(result: NameResult, choice: 'keep' | 'pass') {
    setMarks((previous) => {
      const next = { ...previous }
      if (next[key(result)] === choice) delete next[key(result)]
      else next[key(result)] = choice
      return next
    })
  }
  function toggleAll() {
    if (!run) return
    if (!showAll) seen.current = [...new Set([...seen.current, ...run.proposals.map((p) => p.name)])]
    setShowAll(!showAll)
  }
  function download() {
    const blob = new Blob([JSON.stringify({ run, sessionChoices: marks }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${intentMode ? 'brief-intent' : 'shared-pool'}-${run?.config.seed}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="canvas candidate-lab" aria-label={intentMode ? 'Brief intent Lab' : 'Shared pool Lab'} aria-busy={busy}>
    <h2>{intentMode ? 'Brief intent' : 'Shared pool'} · Lab</h2>
    <p>Nine naming families, up to four finalists. This experiment has no proven preference advantage. Keep and Pass stay in this session and do not train your saved taste profile.</p>
    {intentMode && <>
      <label className="candidate-relation-toggle"><input type="checkbox" checked={meaningFirst} disabled={busy} onChange={(event) => { setMeaningFirst(event.target.checked); if (event.target.checked) setRequireRelation(false) }} /> Use product benefits on next Generate</label>
      {meaningFirst && <label className="candidate-relation-toggle"><input type="checkbox" checked={retainedFragments} disabled={busy} onChange={(event) => setRetainedFragments(event.target.checked)} /> Check retained fragment meanings on next Generate</label>}
      <label className="candidate-relation-toggle"><input type="checkbox" checked={requireRelation} disabled={busy} onChange={(event) => { setRequireRelation(event.target.checked); if (event.target.checked) setMeaningFirst(false) }} /> Require operation–object links on next Generate</label>
    </>}
    <p role="status">{busy ? 'Comparing naming families…' : run ? `${run.finalists.length} ${run.finalists.length === 1 ? 'finalist' : 'finalists'} from ${run.proposals.length} distinct candidates · seed ${run.config.seed}` : 'Describe your project and select Generate.'}</p>
    {error && <p role="alert" className="error-banner">{error}</p>}
    {run && <>
      {run.semantic && <p>Meaning first: {run.semantic.status === 'ready'
        ? `names need a recorded link to the operation or its benefit. More literal brief words do not give a name priority. Object phrase: “${run.semantic.object_phrase?.surface}”.`
        : `unresolved (${run.semantic.reason?.replace(/_/g, ' ')}). No finalists qualify.`}</p>}
      {['frame_pool', 'brief_pool', 'retained_pool'].includes(run.config.variant ?? '') && run.semantic?.status === 'ready' && <p>{run.semantic.product_frame
        ? `Product benefit: ${run.semantic.product_frame.benefit}. This is an editorial association, not a verified preference.`
        : 'No product-benefit frame matched this operation and object. Existing meaning-linked families remain available.'}</p>}
      {run.relation && <p>Operation–object check: {run.relation.status === 'ready'
        ? `${run.relation.operation?.term} → ${run.relation.object_head?.term}. Finalists need separate recorded lexical links to both. This does not prove name quality.`
        : `unresolved (${run.relation.reason?.replace(/_/g, ' ')}). No finalists qualify for this check.`}</p>}
      {run.semantic?.check_retained_fragments && <p>Retained fragment check: Seamblend records the actual spelling cuts. Clipped parts need an existing meaning association in that position. Missing evidence does not prove a name is bad; this inventory may be incomplete.</p>}
      {run.intent && <details className="candidate-intent" open>
        <summary>How the brief was read</summary>
        {run.intent.status === 'fallback' ? <p>Using the original keyword reader: {run.intent.fallback_reason?.replace(/_/g, ' ')}.</p> : <>
          <p>A shallow English grammar groups the brief into roles. These are clues for generation, not verified understanding.</p>
          <dl>{(['operation', 'object', 'condition', 'context'] as const).map((role) => <div key={role}>
            <dt>{role[0].toUpperCase() + role.slice(1)}</dt>
            <dd>{run.intent!.terms.filter((t) => t.role === role).map((t) => t.surface).join(', ') || 'Not identified'}</dd>
          </div>)}</dl>
        </>}
        <p>Generation terms: {run.intent.generation_terms.join(', ') || 'None'}</p>
        {run.semantic?.object_relation && <p>Product: {run.semantic.object_relation.subject.surface} · property: {run.semantic.object_relation.property.surface}. The original phrase is retained; these roles guide naming material.</p>}
        {!!run.semantic?.object_relation?.supporting_terms.length && <p>Supporting words retained outside naming roots: {run.semantic.object_relation.supporting_terms.map((t) => t.surface).join(', ')}.</p>}
      </details>}
      <Shortlist
        finalists={run.finalists.map((f) => f.result)}
        favoriteKeys={new Set(Object.keys(marks).filter((name) => marks[name] === 'keep'))}
        rejectedKeys={new Set(Object.keys(marks).filter((name) => marks[name] === 'pass'))}
        identityOf={key}
        onToggleFavorite={(r) => mark(r, 'keep')}
        onToggleRejected={(r) => mark(r, 'pass')}
        totalCount={run.proposals.length}
        showingAll={showAll}
        onToggleAll={toggleAll}
        note="Selected directly from the family pools. A shorter list means fewer eligible alternatives."
        showStructuralScore={!run.semantic}
        caseLabel={run.semantic ? (r) => {
          const f = run.finalists.find((f) => f.proposalId === key(r))!
          const e = run.proposals.find((p) => p.id === f.proposalId)!.sources.find((s) => s.family === f.selectedFrom)!.semantic!
          if (e.retained_construction) return `Retained parts: ${e.retained_construction.parts.map((p) => `${p.fragment} from ${p.parent} (${p.status.replace(/_/g, ' ')})`).join(' + ')}.`
          if (e.product_frame) return `${e.product_frame.anchor.word}: ${e.product_frame.anchor.sense}. Product benefit: ${e.product_frame.benefit}.`
          if (e.links.some((l) => l.method === 'benefit_construction')) {
            const parents = [...new Set(e.links.filter((l) => ['benefit_construction', 'generator_material'].includes(l.method)).map((l) => l.material))]
            return `Blended from ${parents.join(' + ')}. Product benefit: ${run.semantic?.product_frame?.benefit}.`
          }
          const benefitWord = e.links.find((l) => l.method === 'benefit_word')
          if (benefitWord) {
            const anchor = run.semantic?.product_frame?.anchors.find((a) => a.word === benefitWord.material)
            return `Meaning link: ${benefitWord.material}${anchor ? ` (${anchor.sense})` : ''}. Product benefit: ${run.semantic?.product_frame?.benefit}.`
          }
          if (r.reasonChain) return r.reasonChain
          const terms = [...new Set(e.links.filter((l) => l.method !== 'palette_clue').map((l) => l.term))]
          return `Built from ${terms.join(' + ')}.`
        } : undefined}
        suppliedExplanations={run.semantic ? Object.fromEntries(run.finalists.map((f) => [f.result.name, run.proposals.find((p) => p.id === f.proposalId)!.sources.find((s) => s.family === f.selectedFrom)!.explanation])) : undefined}
        evidenceLabel={run.semantic ? (r) => {
          const f = run.finalists.find((f) => f.proposalId === key(r))!
          const s = run.proposals.find((p) => p.id === f.proposalId)!.sources.find((s) => s.family === f.selectedFrom)!
          const e = s.semantic!
          const linked = e.covered_object_terms.join(', ')
          const pronunciation = e.pronunciation.source === 'dictionary' ? 'dictionary pronunciation'
            : e.pronunciation.source === 'dictionary_components' ? `component estimate: ${e.pronunciation.components.join(' + ')}` : 'spelling estimate'
          const form = e.product_frame ? e.product_frame.construction === 'complete_words' ? 'Complete words; no clipping. ' : 'Whole metaphor. ' : ''
          return `${form}${linked ? `Object link: ${linked} (${e.covered_object_terms.length}/${e.object_terms.length} terms).` : 'Operation or benefit metaphor; no object link recorded.'} ${e.pronunciation.count} syllables · ${pronunciation}.`
        } : undefined}
        availabilityLabel={(r) => {
          const evidence = run.proposals.find((p) => p.id === key(r))?.collision
          return evidence === 'snapshot_absent' ? 'Not in local name snapshot · availability unverified' : evidence === 'snapshot_hit' ? 'Possible local snapshot match' : 'Availability evidence unavailable'
        }}
      />
      {run.finalists.length === 0 && <p>{run.semantic ? 'No candidates passed the meaning check and existing constraints. Inspect the pool to see the missing evidence.' : run.relation ? 'No candidates passed the operation–object check and existing constraints. Inspect the pool to see the missing links.' : 'No eligible finalists in these bounded pools. Try a different brief or constraints.'}</p>}
      <div className="example-chips">
        {run.finalists.length === 0 && run.proposals.length > 0 && <button className="example-chip" disabled={busy} onClick={toggleAll}>{showAll ? 'Hide rejected pool' : 'Inspect rejected pool'}</button>}
        <button className="example-chip" disabled={busy || run.finalists.length === 0} onClick={() => session.current && void generate({ ...session.current, exclude: seen.current })}>Next finalists</button>
        <button className="example-chip" disabled={busy} onClick={download}>Export experiment</button>
      </div>
      {showAll && <div className="candidate-lab-table"><table>
        <caption>Candidate pool and selection decisions</caption>
        <thead><tr><th>Name</th><th>Family / rank</th><th>Meaning evidence</th><th>Decision</th></tr></thead>
        <tbody>{run.proposals.map((p) => <tr key={p.id}>
          <td>{p.name}</td><td>{p.sources.map((s) => `${s.family} #${s.rank}`).join(', ')}</td>
          <td>{run.semantic ? p.sources.map((s) => `${s.family}: ${s.rejection ?? s.semantic?.decision ?? 'missing'}; object ${s.semantic?.covered_object_terms.length ?? 0}/${s.semantic?.object_terms.length ?? 0}${s.semantic?.retained_construction ? '; retained: ' + s.semantic.retained_construction.parts.map((p) => `${p.fragment} ← ${p.parent} (${p.status.replace(/_/g, ' ')})`).join(' + ') : ''}`).join('; ') : run.relation ? p.sources.map((s) => s.relation?.decision.replace(/_/g, ' ') ?? 'No relation evidence').filter((v, i, all) => all.indexOf(v) === i).join(', ') : p.sources.some((s) => s.meaning.status === 'recorded') ? 'Recorded link; fit not independently verified' : 'No per-name semantic evidence recorded'}</td>
          <td>{run.trace.find((t) => t.stage === 'selection' && t.name === p.name)?.decision}</td>
        </tr>)}</tbody>
      </table></div>}
      <details><summary>Generation diagnostics</summary>
        <p>Counts cover materialized spellings and retrieved entries. Attempts that never form a spelling are not counted. Export includes the observed filter and selection events.</p>
        <ul>{run.families.map((f) => <li key={f.family}>{f.family}: {f.returned} returned; {f.internalNotReturned} observed spellings stayed inside the producer.</li>)}</ul>
      </details>
    </>}
  </section>
}
