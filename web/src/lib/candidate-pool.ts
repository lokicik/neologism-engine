import type { BriefIntent, Config, DiagnosticFamilyPage, Explanation, GeneratorTrace, NameResult, ReasonDecode, RelationEvidence, RelationPlan, SemanticEvidence, SemanticPlan, SubmorphDecode } from './engine'
import { isReadableAutoRespell } from './auto'

export const CANDIDATE_FAMILIES = ['brandable', 'compound', 'respell', 'guided_pair', 'guided_metaphor', 'reason', 'submorph', 'seamblend', 'morpheme'] as const
export type CandidateFamily = typeof CANDIDATE_FAMILIES[number]
export const FAMILY_LIMIT = 24
export const FINALIST_LIMIT = 4
export type CollisionEvidence = 'snapshot_hit' | 'snapshot_absent' | 'unknown'

export interface CandidateSource {
  family: CandidateFamily
  rank: number
  meaning: {
    status: 'recorded' | 'missing'
    conceptCoverage: number
    reason?: ReasonDecode
    fragments?: SubmorphDecode
  }
  explanation: Explanation
  result: NameResult
  rejection?: string
  relation?: RelationEvidence
  semantic?: SemanticEvidence
}
export interface CandidateProposal {
  id: string
  name: string
  sources: CandidateSource[]
  collision: CollisionEvidence
}
export interface CandidateTrace {
  name: string
  family?: CandidateFamily
  stage: 'generator' | 'pool' | 'selection'
  decision: string
  detail?: string
  occurrences: number
}
export interface FamilyDiagnostic {
  family: CandidateFamily
  returned: number
  observedSpellings: number
  internalNotReturned: number
  events: GeneratorTrace[]
  durationMs: number
}
export interface CandidatePoolRun {
  schema: 'shared-pool-run-v1'
  config: Config
  intent?: BriefIntent
  relation?: RelationPlan
  semantic?: SemanticPlan
  familyOrder: CandidateFamily[]
  proposals: CandidateProposal[]
  finalists: { proposalId: string; selectedFrom: CandidateFamily; result: NameResult }[]
  trace: CandidateTrace[]
  families: FamilyDiagnostic[]
  durationMs: number
}

const normalized = (name: string) => name.toLowerCase()
export function familyOrder(seed: number): CandidateFamily[] {
  const order = [...CANDIDATE_FAMILIES]
  let state = seed >>> 0
  for (let index = order.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const other = state % (index + 1)
    ;[order[index], order[other]] = [order[other], order[index]]
  }
  return order
}

// No scores, explanation text or comparison labels enter this selector.
export function selectCandidates(proposals: CandidateProposal[], seed: number, limit = FINALIST_LIMIT) {
  limit = Math.max(0, Math.min(FINALIST_LIMIT, Math.trunc(limit)))
  const order = familyOrder(seed)
  const queues = new Map(order.map((family) => [family, proposals.flatMap((p) => p.sources
    .filter((s) => s.family === family && !s.rejection)
    .map((source) => ({ proposal: p, source })))
    .sort((a, b) => a.source.rank - b.source.rank || a.proposal.id.localeCompare(b.proposal.id))]))
  const picked = new Set<string>()
  const openings = new Set<string>()
  const counts = new Map<CandidateFamily, number>()
  const finalists: CandidatePoolRun['finalists'] = []
  const trace: CandidateTrace[] = []
  let progress = true
  while (finalists.length < limit && progress) {
    progress = false
    for (const family of order) {
      if (finalists.length >= limit) break
      if ((counts.get(family) ?? 0) >= 2) continue
      const queue = queues.get(family)!
      while (queue.length) {
        const { proposal, source } = queue.shift()!
        if (picked.has(proposal.id)) continue
        const opening = proposal.id.slice(0, 3)
        if (openings.has(opening)) continue
        picked.add(proposal.id)
        openings.add(opening)
        counts.set(family, (counts.get(family) ?? 0) + 1)
        finalists.push({ proposalId: proposal.id, selectedFrom: family, result: source.result })
        progress = true
        break
      }
    }
  }
  for (const proposal of proposals) {
    const eligible = proposal.sources.filter((s) => !s.rejection)
    const selected = finalists.find((f) => f.proposalId === proposal.id)
    const decision = selected ? 'selected'
      : eligible.length === 0 ? 'no_eligible_source'
        : openings.has(proposal.id.slice(0, 3)) ? 'opening_cap'
          : eligible.every((s) => (counts.get(s.family) ?? 0) >= 2) ? 'family_cap'
            : 'finalist_limit'
    trace.push({ name: proposal.name, family: selected?.selectedFrom, stage: 'selection', decision, occurrences: 1 })
  }
  return { finalists, trace, familyOrder: order }
}

export function poolRejection(result: NameResult, cfg: Config, family: CandidateFamily, collision: CollisionEvidence, terms: string[]): string | undefined {
  const name = normalized(result.name)
  if (!/^[a-z]+$/.test(name)) return 'unsupported_spelling'
  if (name.length < (cfg.min_len ?? 4) || name.length > (cfg.max_len ?? 12)) return 'length'
  if (cfg.exclude?.some((item) => normalized(item) === name)) return 'excluded'
  if (cfg.starts_with && !name.startsWith(cfg.starts_with.toLowerCase())) return 'starts_with'
  if (cfg.contains && !name.includes(cfg.contains.toLowerCase())) return 'contains'
  if (collision === 'snapshot_hit') return 'collision_snapshot'
  if (result.lexicalHazard) return 'lexical_hazard'
  if (family === 'respell' && terms.length > 0 && !isReadableAutoRespell(name, terms)) return 'unlinked_or_unreadable_respell'
  return undefined
}

// Meaning qualification precedes diversity. Descriptions, structural scores,
// handpicked names and feedback labels never enter the ordering.
export function selectSemanticCandidates(proposals: CandidateProposal[], seed: number, prioritizeCoverage = true) {
  const order = familyOrder(seed)
  const candidates = proposals.flatMap((proposal) => proposal.sources
    .filter((source) => !source.rejection && source.semantic?.decision === 'qualified' && source.semantic.tier !== null)
    .map((source) => ({ proposal, source })))
    .sort((a, b) => (prioritizeCoverage ? a.source.semantic!.tier! - b.source.semantic!.tier! : 0)
      || a.source.rank - b.source.rank
      || order.indexOf(a.source.family) - order.indexOf(b.source.family)
      || a.proposal.id.localeCompare(b.proposal.id))
  const constructionKey = (source: CandidateSource) => {
    const e = source.semantic?.product_frame
    return e?.object_term ? `${e.frame_id}:${[e.anchor.word, e.object_term].sort().join('+')}` : undefined
  }
  const constructions = new Set<string>()
  const finalists: CandidatePoolRun['finalists'] = []
  const picked = new Set<string>()
  const openings = new Set<string>()
  const counts = new Map<CandidateFamily, number>()
  for (const { proposal, source } of candidates) {
    if (finalists.length >= FINALIST_LIMIT) break
    if (picked.has(proposal.id) || openings.has(proposal.id.slice(0, 3)) || (counts.get(source.family) ?? 0) >= 2) continue
    const construction = constructionKey(source)
    if (!prioritizeCoverage && construction && constructions.has(construction)) continue
    finalists.push({ proposalId: proposal.id, selectedFrom: source.family, result: source.result })
    picked.add(proposal.id)
    openings.add(proposal.id.slice(0, 3))
    counts.set(source.family, (counts.get(source.family) ?? 0) + 1)
    if (construction) constructions.add(construction)
  }
  const trace: CandidateTrace[] = proposals.map((p) => {
    const selected = finalists.find((f) => f.proposalId === p.id)
    const qualified = candidates.filter((c) => c.proposal.id === p.id)
    const decision = selected ? 'selected' : !qualified.length ? 'no_qualified_source'
      : openings.has(p.id.slice(0, 3)) ? 'opening_cap'
        : !prioritizeCoverage && qualified.every((c) => { const key = constructionKey(c.source); return key && constructions.has(key) }) ? 'construction_duplicate'
        : qualified.every((c) => (counts.get(c.source.family) ?? 0) >= 2) ? 'family_cap' : 'finalist_limit'
    return { name: p.name, family: selected?.selectedFrom, stage: 'selection', decision, occurrences: 1 }
  })
  return { finalists, trace, familyOrder: order }
}

const variants: Record<CandidateFamily, string | undefined> = {
  brandable: undefined, compound: undefined, respell: 'respell', guided_pair: 'concept_pair', guided_metaphor: 'metaphor', reason: 'reason', submorph: 'submorph', seamblend: 'seamblend', morpheme: 'morpheme',
}

export async function generateCandidatePool(input: Config): Promise<CandidatePoolRun> {
  if (input.style !== 'big_tech') throw new Error('The shared pool supports developer names only.')
  if (input.seed !== undefined && (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff)) throw new Error('Seed must be a 32-bit unsigned integer.')
  const config = { ...input, seed: input.seed ?? 13 }
  // Lazy import leaves production generation and its data loading independent.
  const { generateDiagnosticFamily, cratesTaken, explainName, extractKeywords } = await import('./engine')
  const start = performance.now()
  const terms = [...(config.description?.trim() ? await extractKeywords(config.description) : []), ...(config.roots ?? [])]
  const proposals = new Map<string, CandidateProposal>()
  const trace: CandidateTrace[] = []
  const families: FamilyDiagnostic[] = []
  let intent: BriefIntent | undefined
  let relation: RelationPlan | undefined
  let semantic: SemanticPlan | undefined
  for (const family of CANDIDATE_FAMILIES) {
    const began = performance.now()
    const page: DiagnosticFamilyPage = await generateDiagnosticFamily({ ...config, variant: variants[family], compound: family === 'compound', count: FAMILY_LIMIT }, config.variant === 'retained_pool' ? 'retained_fragments' : config.variant === 'brief_pool' ? 'product_brief' : config.variant === 'frame_pool' ? 'product_frame' : config.variant === 'semantic_pool' ? 'semantic' : config.variant === 'relation_pool' ? 'relation' : config.variant === 'intent_pool')
    intent = page.intent
    relation = page.relation
    semantic = page.semantic
    const emitted = new Set(page.results.map((r) => normalized(r.name)))
    const observed = new Set(page.trace.map((r) => normalized(r.name)))
    for (const name of emitted) observed.add(name)
    const internal = [...observed].filter((name) => !emitted.has(name))
    families.push({ family, returned: page.results.length, observedSpellings: observed.size, internalNotReturned: internal.length, events: page.trace, durationMs: performance.now() - began })
    for (const name of internal) {
      const events = page.trace.filter((e) => e.name === name)
      const ranking = events.some((e) => e.stage.endsWith('rank_input'))
      trace.push({ name, family, stage: 'generator', decision: ranking ? 'internal_selection' : 'internal_filter', detail: [...new Set(events.filter((e) => e.stage.endsWith('filter') || e.stage.endsWith('selection')).map((e) => `${e.stage}:${e.reason}`))].join(', ') || 'family ranking / page budget', occurrences: 1 })
    }
    for (const [index, raw] of page.results.entries()) {
      const id = normalized(raw.name)
      const evidence = page.evidence.find((e) => normalized(e.name) === id)
      const reason = evidence && 'chain' in evidence ? evidence : undefined
      const fragments = evidence && 'head' in evidence ? evidence : undefined
      const relationEvidence = page.relationEvidence?.find((e) => normalized(e.name) === id)
      const semanticEvidence = page.semanticEvidence?.find((e) => normalized(e.name) === id)
      const sourceMode = family === 'guided_pair' || family === 'guided_metaphor' ? 'brandable' : family
      const result: NameResult = { ...raw, sourceMode, reasonChain: reason
        ? `${[...reason.chain, reason.name].join(' → ')} — ${reason.gloss} (${reason.origin})`
        : fragments ? `${fragments.head} = ${fragments.head_gloss} + ${fragments.tail} = ${fragments.tail_quality ? 'canon suffix' : fragments.tail_gloss}` : undefined }
      const taken = cratesTaken(result.name)
      const collision = taken === undefined ? 'unknown' : taken ? 'snapshot_hit' : 'snapshot_absent'
      const source: CandidateSource = {
        family, rank: index + 1, result,
        explanation: page.explanations?.[index] ?? await explainName(result.name),
        meaning: { status: (reason?.chain.length || fragments?.head_hits.length || fragments?.tail_hits.length || (raw.concept_coverage ?? 0)) ? 'recorded' : 'missing', conceptCoverage: raw.concept_coverage ?? 0, reason, fragments },
        rejection: poolRejection(result, config, family, collision, intent ? [...intent.generation_terms, ...(config.roots ?? [])] : terms)
          ?? (relation ? relationEvidence?.decision === 'linked' ? undefined : relationEvidence?.decision ?? 'relation_evidence_missing' : undefined)
          ?? (semantic ? semanticEvidence?.decision === 'qualified' ? undefined : semanticEvidence?.decision ?? 'meaning_evidence_missing' : undefined),
        ...(relationEvidence ? { relation: relationEvidence } : {}),
        ...(semanticEvidence ? { semantic: semanticEvidence } : {}),
      }
      const existing = proposals.get(id)
      if (existing) existing.sources.push(source)
      else proposals.set(id, { id, name: result.name, sources: [source], collision })
      trace.push({ name: result.name, family, stage: 'pool', decision: source.rejection ?? 'eligible', detail: existing ? 'merged spelling; source evidence retained' : undefined, occurrences: 1 })
    }
  }
  const materialized = [...proposals.values()]
  // Frame v1 uses meaning as eligibility, never as an aesthetic score. Keep
  // the old selector callable for replay and the fixed-pool ablation.
  const selection = semantic ? selectSemanticCandidates(materialized, config.seed, !['frame_pool', 'brief_pool', 'retained_pool'].includes(config.variant ?? '')) : selectCandidates(materialized, config.seed)
  return { schema: 'shared-pool-run-v1', config, ...(intent ? { intent } : {}), ...(relation ? { relation } : {}), ...(semantic ? { semantic } : {}), proposals: materialized, ...selection, trace: [...trace, ...selection.trace], families, durationMs: performance.now() - start }
}
