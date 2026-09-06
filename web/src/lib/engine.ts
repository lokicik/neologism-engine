import init, {
  generate_names,
  batch_metrics,
  concept_coverages,
  lexical_hazards,
  explain_name,
  extract_keywords,
  load_semfield,
  load_pron_lexicon,
  load_collision,
  collision_risk,
  generate_reason_page,
  generate_submorph_page,
  generate_candidate_diagnostics,
  generate_intent_candidate_diagnostics,
  generate_relation_candidate_diagnostics,
  generate_semantic_candidate_diagnostics,
  generate_product_frame_diagnostics,
  generate_product_brief_diagnostics,
  generate_retained_fragment_diagnostics,
  generate_concept_diagnostics,
} from '../wasm/neologism_wasm.js'
import { autoModeCounts, isReadableAutoRespell, mergeAutoBatches } from './auto'
import { tasteContextForConfig } from './taste-context'

export type Style = 'big_tech' | 'sci_fi' | 'fantasy'
export type NamingMode = 'brandable' | 'realword' | 'respell' | 'compound' | 'seamblend' | 'morpheme' | 'submorph' | 'reason'

export interface TasteContext {
  id: string
  description?: string
  roots: string[]
}

export interface Config {
  style: Style
  count?: number
  min_len?: number
  max_len?: number
  temperature?: number
  variety?: number
  seed?: number
  roots?: string[]
  variant?: string
  description?: string
  compound?: boolean
  starts_with?: string
  contains?: string
  exclude?: string[]
}

export interface NameResult {
  name: string
  style: Style
  sourceMode?: NamingMode
  construction?: 'guided_metaphor' | 'guided_pair'
  constructionRank?: 1 | 2
  tasteContext?: TasteContext
  syllables: number
  score_pronounce: number
  score_novelty: number
  score_memorability: number
  concept_coverage?: number
  lexicalHazard?: boolean
  connotations: string[]
  /// Reason family only: the human-readable chain + gloss shown on the card
  /// ("password → vault → Donjon — innermost keep of the castle").
  reasonChain?: string
}

const GUIDED_METAPHOR_POOL = 8
const REASON_ACCENT_POOL = 4
const REASON_ACCENT_FAMILY_CAP = 4
const GUIDED_PAIR_POOL = 12
const LEGAL_GUIDED_PAIR_POOL = 24
const AUTO_ACCENT_QUALITY_FLOOR = 75
const GUIDED_METAPHOR_QUALITY_FLOOR = 85
const GUIDED_PAIR_QUALITY_FLOOR = 84
const RECRUITER_RESPELL_QUALITY_FLOOR = 80
const RESPELL_COMPANION_PAIR_QUALITY_FLOOR = 85
const GUIDED_PAIR_SET_GAIN = 2
const NAMING_VISIBLE_PREFIX_CAP = 3
const GUIDED_METAPHOR_FALLBACK_SEED_OFFSET = 16
// Order is deliberate: preserve the stronger Kinloom and Kitwave pools before
// the narrow adjacent-seed pool gets a chance to supply Bufferlab.
const COLD_LEAD_METAPHOR_RETRY_SEED_OFFSETS = [13, 521, 1]
const UINT32_RANGE = 0x1_0000_0000
const GUIDED_METAPHOR_TAILS = [
  'flow', 'forge', 'spark', 'seed', 'craft', 'lab', 'wave', 'link', 'pulse', 'beam',
  'prism', 'lumen', 'nova', 'peak', 'signal', 'smith', 'grove', 'glow', 'loom', 'muse',
  'flux', 'atlas',
]
const DIRECT_SUFFIX_TAILS = ['ify', 'ora', 'ion', 'era', 'io', 'ia', 'ix', 'el', 'en', 'on']

const structuralQuality = (result: NameResult): number => (
  result.score_pronounce * 0.4
  + result.score_memorability * 0.3
  + result.score_novelty * 0.3
)

const letters = (value: string): string => value.toLowerCase().replace(/[^a-z]/g, '')

const isRecruiterTrackingBrief = (terms: string[]): boolean => {
  const normalized = new Set(terms.map(letters))
  return ['candidate', 'applicant', 'recruit', 'recruiter', 'talent', 'hire']
    .some((term) => normalized.has(term))
    && ['track', 'pipeline'].some((term) => normalized.has(term))
}

const isFeatureFlagBrief = (terms: string[]): boolean => {
  const normalized = new Set(terms.map(letters))
  return normalized.has('feature')
    && ['flag', 'toggle', 'rollout', 'switch', 'gate'].some((term) => normalized.has(term))
}

const isNamingToolBrief = (terms: string[]): boolean => {
  const normalized = new Set(terms.map(letters))
  return ['name', 'naming', 'word']
    .some((term) => normalized.has(term))
    && [
      'engine', 'generate', 'generator', 'product', 'package',
      'available', 'availability', 'registry', 'namespace', 'developer',
    ].some((term) => normalized.has(term))
}

const isColorPaletteBrief = (terms: string[]): boolean => {
  const normalized = new Set(terms.map(letters))
  return ['color', 'palette'].some((term) => normalized.has(term))
    && ['design', 'visual', 'creative', 'generator', 'scheme'].some((term) => normalized.has(term))
}

const isLegalResearchBrief = (terms: string[]): boolean => {
  const normalized = new Set(terms.map(letters))
  return ['legal', 'law', 'lawyer', 'attorney', 'court', 'litigation']
    .some((term) => normalized.has(term))
    && [
      'research', 'investigate', 'investigation', 'search',
      'citation', 'precedent', 'opinion',
    ].some((term) => normalized.has(term))
}

const isDeliveryTrackingBrief = (terms: string[]): boolean => {
  const normalized = new Set(terms.map(letters))
  return [
    'delivery', 'ship', 'shipping', 'logistic', 'logistics', 'transport', 'parcel', 'shipment',
  ].some((term) => normalized.has(term))
    && [
      'track', 'tracking', 'operation', 'operations', 'dispatch',
    ].some((term) => normalized.has(term))
}

const isCloudDeploymentBrief = (terms: string[]): boolean => {
  const normalized = new Set(terms.map(letters))
  return ['cloud', 'hosting', 'infrastructure', 'infra'].some((term) => normalized.has(term))
    && ['deploy', 'deployment'].some((term) => normalized.has(term))
}

export const guidedMetaphorTail = (result: NameResult): string | undefined => {
  const normalized = letters(result.name)
  return GUIDED_METAPHOR_TAILS.find((tail) => normalized.endsWith(tail))
}

const isDirectSuffixForm = (result: NameResult): boolean => {
  const normalized = letters(result.name)
  return result.sourceMode === 'brandable'
    && result.concept_coverage === 1
    && DIRECT_SUFFIX_TAILS.some((tail) => normalized.endsWith(tail))
}

const guidedMetaphorFallbackSeed = (
  seed: number | undefined,
  offset: number,
): number | undefined => (
  seed === undefined
    ? undefined
    : (Math.trunc(seed) % UINT32_RANGE + offset + UINT32_RANGE) % UINT32_RANGE
)

const pickGuidedMetaphor = (results: NameResult[]): NameResult[] => {
  const ranked = results
    .filter((result) => (
      (result.concept_coverage ?? 0) > 0
      && structuralQuality(result) >= GUIDED_METAPHOR_QUALITY_FLOOR
    ))
    .sort((left, right) => structuralQuality(right) - structuralQuality(left))
  const selected: NameResult[] = []
  const tails = new Set<string>()
  for (const result of ranked) {
    const tail = guidedMetaphorTail(result)
    if (!tail || tails.has(tail)) continue
    selected.push({
      ...result,
      construction: 'guided_metaphor',
      constructionRank: selected.length === 0 ? 1 : 2,
    })
    tails.add(tail)
    if (selected.length === 2) break
  }
  return selected
}

const pickGuidedPair = (results: NameResult[]): NameResult[] => results
  .filter((result) => (
    (result.concept_coverage ?? 0) >= 2
    && structuralQuality(result) >= GUIDED_PAIR_QUALITY_FLOOR
  ))
  .sort((left, right) => structuralQuality(right) - structuralQuality(left))
  .slice(0, 4)
  .map((result) => ({ ...result, construction: 'guided_pair' }))

const addQualityNeutralGuidedAlternative = (
  page: NameResult[],
  candidate: NameResult | undefined,
  preservePrefixBalance = false,
): NameResult[] => {
  if (!candidate || page.some((result) => letters(result.name) === letters(candidate.name))) return page
  const quality = structuralQuality(candidate)
  const replacements = page
    .map((result, index) => ({ result, index, quality: structuralQuality(result) }))
    .filter(({ result, quality: replacedQuality }) => (
      isDirectSuffixForm(result) && replacedQuality <= quality + Number.EPSILON
    ))
    .sort((left, right) => left.quality - right.quality || right.index - left.index)
  const candidatePrefix = letters(candidate.name).slice(0, 3)
  const samePrefixCount = preservePrefixBalance
    ? page.filter((result) => letters(result.name).startsWith(candidatePrefix)).length
    : 0
  const replacement = preservePrefixBalance && samePrefixCount >= NAMING_VISIBLE_PREFIX_CAP
    ? replacements.find(({ result }) => letters(result.name).startsWith(candidatePrefix))
    : replacements[0]
  if (!replacement) return page
  const next = page.slice()
  next[replacement.index] = candidate
  return next
}

// Which reasoning card is offered to a brief-driven page. Plain seed % pool
// collides on neighbouring seeds (13 and 313 pick the same card), which would
// pin one story to every seed page and cost cross-seed diversity, so the seed
// is mixed first.
const pickReasonCandidate = (
  pool: NameResult[],
  seed: number | undefined,
): NameResult | undefined => {
  if (pool.length === 0) return undefined
  const mixed = Math.imul(Math.trunc(seed ?? 0) >>> 0, 2654435761) >>> 0
  return pool[mixed % pool.length]
}

// The reasoning card never competes for a slot: it is offered the weakest
// direct-suffix card on the finished page and takes it only if it is at least
// as strong — the same quality-neutral swap the second metaphor uses. It also
// never takes the lead: the lead is the page's argument for itself, and the
// pinned brief-specific leads (SkyDock, LexCite, ShipOps) depend on it.
// A page's shape is as much a quality as its names: replacing the one card
// that breaks a suffix family (four "-lens" names plus one "-ify") would hand
// the page a five-name wall. The swap is only taken when it does not make the
// largest family larger.
const familyTail = (value: string): string => letters(value).slice(-4)

const largestFamily = (page: NameResult[]): number => {
  const counts = new Map<string, number>()
  for (const result of page) {
    const tail = familyTail(result.name)
    counts.set(tail, (counts.get(tail) ?? 0) + 1)
  }
  return Math.max(0, ...counts.values())
}

const offerReasoningSlot = (
  page: NameResult[],
  candidate: NameResult | undefined,
): NameResult[] => {
  if (!candidate || page.some((result) => letters(result.name) === letters(candidate.name))) {
    return page
  }
  const quality = structuralQuality(candidate)
  // Only a direct-suffix form gives up its slot - a name whose whole idea is a
  // brandable ending. Letting the card also take a stem-wall member was tried
  // and reverted: it raised story-card coverage from 57% to nearly all pages,
  // but the same story then repeated across a brief's seed pages and cost the
  // cross-seed diversity two brief families are held to. A page whose ten
  // names are all compounds ("a self hosted password manager") therefore keeps
  // its shape and gets no story card, which is the honest trade.
  const slots = page
    .map((result, index) => ({ result, index, quality: structuralQuality(result) }))
    .filter(({ result, index, quality: replacedQuality }) => (
      index > 0 && isDirectSuffixForm(result) && replacedQuality <= quality + Number.EPSILON
    ))
    .sort((left, right) => left.quality - right.quality || right.index - left.index)
  const wall = largestFamily(page)
  // A page already sitting on a four-name suffix family has no room to give:
  // taking one of its few outsiders would leave a wall, and the repair pass
  // that would have broken it up loses the slot it needed.
  if (wall >= REASON_ACCENT_FAMILY_CAP) return page
  for (const slot of slots) {
    const next = page.slice()
    next[slot.index] = candidate
    if (largestFamily(next) <= wall) return next
  }
  return page
}

const addStrongGuidedPairUpgrade = (
  page: NameResult[],
  candidate: NameResult | undefined,
  preservePrefixBalance = false,
): NameResult[] => {
  if (
    !candidate
    || structuralQuality(candidate) < RESPELL_COMPANION_PAIR_QUALITY_FLOOR
    || page.some((result) => letters(result.name) === letters(candidate.name))
  ) return page
  const quality = structuralQuality(candidate)
  const replacements = page
    .map((result, index) => ({ result, index, quality: structuralQuality(result) }))
    .filter(({ result, quality: replacedQuality }) => (
      isDirectSuffixForm(result)
      && replacedQuality + GUIDED_PAIR_SET_GAIN <= quality + Number.EPSILON
    ))
    .sort((left, right) => left.quality - right.quality || right.index - left.index)
  const candidatePrefix = letters(candidate.name).slice(0, 3)
  const samePrefixReplacement = preservePrefixBalance
    ? replacements.find(({ result }) => letters(result.name).startsWith(candidatePrefix))
    : undefined
  const samePrefixCount = preservePrefixBalance
    ? page.filter((result) => letters(result.name).startsWith(candidatePrefix)).length
    : 0
  const replacement = preservePrefixBalance && samePrefixCount >= NAMING_VISIBLE_PREFIX_CAP
    ? samePrefixReplacement
    : replacements[0]
  if (!replacement) return page
  const next = page.slice()
  next[replacement.index] = candidate
  return next
}

const preserveGuidedConstruction = (
  page: NameResult[],
  candidate: NameResult | undefined,
): NameResult[] => {
  if (!candidate) return page
  // mergeAutoBatches may keep the ordinary Brandable copy when the guided
  // pool found the same spelling. Preserve its provenance on that one card.
  const candidateName = letters(candidate.name)
  return page.map((result) => (
    letters(result.name) === candidateName
      ? {
          ...result,
          construction: candidate.construction ?? 'guided_metaphor',
          constructionRank: candidate.constructionRank ?? 1,
        }
      : result
  ))
}

let initialization: Promise<void> | null = null

async function ensureInit() {
  if (!initialization) {
    initialization = init()
      .then(() => undefined)
      .catch((error) => {
        initialization = null
        throw error
      })
  }
  await initialization
}

// The seam-blend Lab mode's data tables (~0.5 MB gzipped) are kept out of the
// wasm binary so production Auto's first load is unaffected. Fetch them as
// separate lazy chunks and inject them the first time seam-blend is used.
let seamblendData: Promise<void> | null = null
let collisionDataLoaded = false
async function ensureSeamblendData() {
  if (!seamblendData) {
    seamblendData = (async () => {
      await ensureInit()
      const [neighbors, pron, bloomUrl] = await Promise.all([
        import('../../../core/data/semfield/neighbors.tsv?raw'),
        import('../../../core/data/pron_lexicon.tsv?raw'),
        import('../../../core/data/collision.bloom?url'),
      ])
      load_semfield(neighbors.default)
      load_pron_lexicon(pron.default)
      const bloom = await fetch(bloomUrl.default)
      load_collision(new Uint8Array(await bloom.arrayBuffer()))
      collisionDataLoaded = true
    })().catch((error) => {
      seamblendData = null
      throw error
    })
  }
  await seamblendData
}

/// Instant crates.io/brand-corpus name check (bloom membership, ~0.5% false
/// positive on "taken"; "free" is definitive). Returns undefined until the
/// Lab data bundle has loaded — cards simply omit the chip then.
export function cratesTaken(name: string): boolean | undefined {
  if (!collisionDataLoaded) return undefined
  try {
    const flags = JSON.parse(collision_risk(JSON.stringify([name.toLowerCase()])))
    return Array.isArray(flags) ? Boolean(flags[0]) : undefined
  } catch {
    return undefined
  }
}

export interface ReasonDecode {
  name: string
  kind: string
  origin: string
  gloss: string
  chain: string[]
  taken: boolean
}

export interface SubmorphDecode {
  name: string
  head: string
  head_gloss: string
  tail: string
  tail_gloss: string
  tail_quality: boolean
  head_hits: string[]
  tail_hits: string[]
  junction: string
}

export interface GeneratorTrace {
  name: string
  stage: string
  reason: string
  occurrences: number
}

export interface BriefIntent {
  schema: 'brief-intent-v1'
  description: string
  status: 'parsed' | 'fallback'
  fallback_reason: string | null
  terms: { term: string; surface: string; start: number; end: number; role: 'operation' | 'object' | 'condition' | 'context' }[]
  generation_terms: string[]
}

export interface DiagnosticFamilyPage {
  results: NameResult[]
  evidence: (ReasonDecode | SubmorphDecode)[]
  trace: GeneratorTrace[]
  intent?: BriefIntent
  coverages?: number[]
  hazards?: boolean[]
  relation?: RelationPlan
  relationEvidence?: RelationEvidence[]
  semantic?: SemanticPlan
  semanticEvidence?: SemanticEvidence[]
  explanations?: Explanation[]
}

export interface SemanticPlan {
  check_retained_fragments?: boolean
  schema: 'meaning-first-plan-v1'
  intent: BriefIntent
  status: 'ready' | 'unresolved'
  reason: string | null
  object_phrase: { surface: string; start: number; end: number; terms: BriefIntent['terms'] } | null
  material: MaterialRoot[]
  product_frame?: { id: string; operation: string; matched_objects: string[]; benefit: string; anchors: { word: string; sense: string }[]; provenance: string }
  object_relation?: { subject: BriefIntent['terms'][number]; property: BriefIntent['terms'][number]; supporting_terms: BriefIntent['terms']; provenance: string }
}
export interface SemanticEvidence {
  retained_construction?: { method: string; shared_phonemes: number; parts: { parent: string; fragment: string; source_start: number; source_end: number; start: number; end: number; status: string; associations: string[] }[] }
  name: string
  links: { term: string; role: string; method: string; material: string }[]
  object_terms: string[]
  covered_object_terms: string[]
  tier: number | null
  decision: string
  pronunciation: { count: number; source: string; components: string[] }
  product_frame?: { frame_id: string; benefit: string; anchor: { word: string; sense: string }; object_term: string | null; construction: 'complete_words' | 'whole_metaphor'; provenance: string }
}

export interface MaterialRoot { root: string; term: string; source: string }
export interface RelationPlan {
  schema: 'operation-object-plan-v1'
  intent: BriefIntent
  status: 'ready' | 'unresolved'
  reason: string | null
  operation: BriefIntent['terms'][number] | null
  object_head: BriefIntent['terms'][number] | null
  operation_roots: MaterialRoot[]
  object_roots: MaterialRoot[]
}
export interface RelationEvidence {
  name: string
  operation: { material: MaterialRoot; start: number; end: number }[]
  object: { material: MaterialRoot; start: number; end: number }[]
  decision: string
}

// This additive entry point is used only by the shared-pool Lab and its audit.
export async function generateDiagnosticFamily(cfg: Config, useIntent: boolean | 'relation' | 'semantic' | 'product_frame' | 'product_brief' | 'retained_fragments' = false): Promise<DiagnosticFamilyPage> {
  await ensureSeamblendData()
  const generate = useIntent === 'retained_fragments' ? generate_retained_fragment_diagnostics : useIntent === 'product_brief' ? generate_product_brief_diagnostics : useIntent === 'product_frame' ? generate_product_frame_diagnostics : useIntent === 'semantic' ? generate_semantic_candidate_diagnostics : useIntent === 'relation' ? generate_relation_candidate_diagnostics : useIntent ? generate_intent_candidate_diagnostics : generate_candidate_diagnostics
  const page = JSON.parse(generate(JSON.stringify(cfg))) as DiagnosticFamilyPage | { error: string }
  if ('error' in page) throw new Error(page.error)
  const names = JSON.stringify(page.results.map((r) => r.name))
  const coverage = page.coverages ?? JSON.parse(concept_coverages(cfg.description ?? '', names)) as number[]
  const hazards = page.hazards ?? JSON.parse(lexical_hazards(cfg.description ?? '', names)) as boolean[]
  page.results = page.results.map((r, index) => ({ ...r, concept_coverage: coverage[index] ?? 0, lexicalHazard: hazards[index] || undefined }))
  return page
}

export async function generateNames(cfg: Config): Promise<NameResult[]> {
  await ensureInit()
  if (cfg.variant === 'seamblend' || cfg.variant === 'morpheme' || cfg.variant === 'submorph') {
    await ensureSeamblendData()
  } else {
    // Warm the Lab bundle in the background so the crates.io chip appears on
    // every page (it renders only once collision data is loaded). Never block
    // the classic paths on it, and never let its failure break generation.
    void ensureSeamblendData().catch(() => {})
  }
  if (cfg.variant === 'submorph') {
    // Dense coinages carry their per-syllable decode onto the card.
    const page = JSON.parse(generate_submorph_page(JSON.stringify(cfg))) as
      | { results: NameResult[]; decodes: SubmorphDecode[] }
      | { error: string }
    if ('error' in page) throw new Error(page.error)
    const byName = new Map(page.decodes.map((d) => [d.name, d]))
    return page.results.map((result) => {
      const d = byName.get(result.name)
      return {
        ...result,
        sourceMode: 'submorph' as const,
        reasonChain: d
          ? `${d.head} = ${d.head_gloss} + ${d.tail} = ${d.tail_quality ? 'canon suffix' : d.tail_gloss}`
          : undefined,
      }
    })
  }
  if (cfg.variant === 'reason') {
    // The reasoning family returns its argument with every name; carry the
    // chain onto the result so the card can show it.
    await ensureSeamblendData() // collision bloom marks taken entries
    const page = JSON.parse(generate_reason_page(JSON.stringify(cfg))) as
      | { results: NameResult[]; decodes: ReasonDecode[] }
      | { error: string }
    if ('error' in page) throw new Error(page.error)
    const byName = new Map(page.decodes.map((d) => [d.name, d]))
    return page.results.map((result) => {
      const d = byName.get(result.name)
      const chain = d && d.chain.length > 0 ? `${d.chain.join(' → ')} → ${d.name}` : d?.name
      return {
        ...result,
        sourceMode: 'reason' as const,
        reasonChain: d ? `${chain} — ${d.gloss} (${d.origin}${d.taken ? ', taken' : ''})` : undefined,
      }
    })
  }
  const json = generate_names(JSON.stringify(cfg))
  const parsed = JSON.parse(json) as NameResult[] | { error: string }
  if ('error' in parsed) throw new Error((parsed as { error: string }).error)
  const results = parsed as NameResult[]
  const coverageJson = cfg.style === 'big_tech' && cfg.description?.trim()
    ? concept_coverages(cfg.description, JSON.stringify(results.map((result) => result.name)))
    : '[]'
  const coverages = JSON.parse(coverageJson) as number[] | { error: string }
  if ('error' in coverages) throw new Error((coverages as { error: string }).error)
  const hazardsJson = cfg.style === 'big_tech' && cfg.description?.trim()
    ? lexical_hazards(cfg.description, JSON.stringify(results.map((result) => result.name)))
    : '[]'
  const hazards = JSON.parse(hazardsJson) as boolean[] | { error: string }
  if ('error' in hazards) throw new Error((hazards as { error: string }).error)
  const tasteContext = tasteContextForConfig(cfg)
  const contextual = results.map((result, index) => ({
    ...result,
    // concept_pair emits only joins across two distinct engine groups. Its
    // supplemental function group is intentionally private to that isolated
    // lane, so the general-purpose coverage API cannot see the second half.
    concept_coverage: cfg.variant === 'concept_pair'
      ? Math.max(2, (coverages as number[])[index] ?? 0)
      : (coverages as number[])[index] ?? 0,
    lexicalHazard: (hazards as boolean[])[index] || undefined,
    tasteContext,
  }))
  if (cfg.style !== 'big_tech') return contextual

  // The WASM result intentionally stays engine-generic; the web layer knows
  // which big-tech strategy produced each sub-batch and preserves that source
  // for local taste learning and persisted feedback.
  const sourceMode: NamingMode = cfg.variant === 'realword'
    ? 'realword'
    : cfg.variant === 'respell'
      ? 'respell'
      : cfg.variant === 'seamblend'
        ? 'seamblend'
        : cfg.variant === 'morpheme'
          ? 'morpheme'
          : cfg.variant === 'submorph'
            ? 'submorph'
            : cfg.compound
              ? 'compound'
              : 'brandable'
  return contextual.map((result) => ({ ...result, sourceMode }))
}

// A cold-page retry is requested only after normal generation, repair, and
// lead ordering still leave a direct suffix first. Keep its metaphor and
// semantic-pair pools separate so ordinary pages and continued sessions do not
// absorb another broad fallback.
export async function generateColdLeadRetry(cfg: Config): Promise<NameResult[]> {
  const batches = await Promise.all([
    ...COLD_LEAD_METAPHOR_RETRY_SEED_OFFSETS.map(async (offset) => (
      pickGuidedMetaphor(await generateNames({
        ...cfg,
        variant: 'metaphor',
        compound: false,
        count: GUIDED_METAPHOR_POOL,
        seed: guidedMetaphorFallbackSeed(cfg.seed, offset),
      }))
    )),
    generateNames({
      ...cfg,
      variant: 'concept_pair',
      compound: false,
      count: GUIDED_PAIR_POOL,
    }).then(pickGuidedPair),
  ])
  return batches.flat()
}

// Auto mode (web-only meta-mode): choose a brief-aware mode mix. The engine
// never sees variant:'auto'. A guided batch uses Brandable plus at most one
// prompt-derived Respell; an empty brief keeps the broad four-mode sampler.
// Shared by Create (Auto) and the AI Studio pool.
export async function generateBatch(cfg: Config): Promise<NameResult[]> {
  if (cfg.variant !== 'auto') return generateNames(cfg)
  const total = cfg.count ?? 10
  const hasBrief = Boolean(cfg.description?.trim() || cfg.roots?.some((root) => root.trim()))
  const { brandable, realword, respell, compound } = autoModeCounts(total, hasBrief)
  if (hasBrief) {
    const terms = [
      ...(cfg.description?.trim() ? await extractKeywords(cfg.description) : []),
      ...(cfg.roots ?? []),
    ]
    const recruiterTrackingBrief = isRecruiterTrackingBrief(terms)
    const featureFlagBrief = isFeatureFlagBrief(terms)
    const namingToolBrief = isNamingToolBrief(terms)
    const colorPaletteBrief = isColorPaletteBrief(terms)
    const legalResearchBrief = isLegalResearchBrief(terms)
    const deliveryTrackingBrief = isDeliveryTrackingBrief(terms)
    const cloudDeploymentBrief = isCloudDeploymentBrief(terms)
    const strongPairBrief = featureFlagBrief
      || namingToolBrief
      || deliveryTrackingBrief
      || cloudDeploymentBrief
    const guidedPairPool = legalResearchBrief ? LEGAL_GUIDED_PAIR_POOL : GUIDED_PAIR_POOL
    const [brandableBatch, respellBatch] = await Promise.all([
      generateNames({ ...cfg, variant: undefined, compound: false, count: total }),
      respell > 0
        ? generateNames({ ...cfg, variant: 'respell', compound: false, count: respell })
        : Promise.resolve([]),
    ])
    const linkedRespells = respellBatch
      .filter((result) => (
        isReadableAutoRespell(result.name, terms)
        && structuralQuality(result) >= (
          recruiterTrackingBrief ? RECRUITER_RESPELL_QUALITY_FLOOR : AUTO_ACCENT_QUALITY_FLOOR
        )
      ))
      .slice(0, respell)
    // Respell normally owns the single guided accent when it is genuinely
    // derived from the brief. A color-palette page may also keep one strong
    // semantic metaphor because its compact suffix pool otherwise converges on
    // the same first page across seeds.
    let metaphorAccent: NameResult[] = []
    let pairAccent: NameResult[] = []
    if (total > 0 && recruiterTrackingBrief) {
      // The scoped hiring-workflow role is stronger than this domain's broad
      // metaphor pool. It may coexist with a safe Respell or become the sole
      // guided construction when no spelling survives.
      pairAccent = pickGuidedPair(await generateNames({
        ...cfg,
        variant: 'concept_pair',
        compound: false,
        count: guidedPairPool,
      }))
    } else if (total > 0 && (linkedRespells.length === 0 || colorPaletteBrief)) {
      const metaphorConfig = {
        ...cfg,
        variant: 'metaphor',
        compound: false,
        count: GUIDED_METAPHOR_POOL,
      }
      metaphorAccent = pickGuidedMetaphor(await generateNames(metaphorConfig))
      // The independent seed is a fresh-page second chance only. Keep every
      // primary-pool winner, then fill at most one missing distinct tail.
      if (metaphorAccent.length < 2 && (cfg.exclude?.length ?? 0) === 0) {
        const usedNames = new Set(metaphorAccent.map((result) => letters(result.name)))
        const usedTails = new Set(metaphorAccent.map(guidedMetaphorTail))
        const fallback = pickGuidedMetaphor(await generateNames({
          ...metaphorConfig,
          seed: guidedMetaphorFallbackSeed(cfg.seed, GUIDED_METAPHOR_FALLBACK_SEED_OFFSET),
        }))
        for (const result of fallback) {
          const name = letters(result.name)
          const tail = guidedMetaphorTail(result)
          if (!tail || usedNames.has(name) || usedTails.has(tail)) continue
          metaphorAccent.push({
            ...result,
            constructionRank: metaphorAccent.length === 0 ? 1 : 2,
          })
          usedNames.add(name)
          usedTails.add(tail)
          if (metaphorAccent.length === 2) break
        }
      }
      // If no metaphor survives the 85-point gate, try one explicit semantic
      // pair. Scoped product roles may also compare against the second
      // metaphor slot while preserving the first metaphor.
      if (
        metaphorAccent.length === 0
        || strongPairBrief
        || legalResearchBrief
      ) {
        pairAccent = pickGuidedPair(await generateNames({
          ...cfg,
          variant: 'concept_pair',
          compound: false,
          count: guidedPairPool,
        }))
      }
    } else if (total > 0 && (strongPairBrief || legalResearchBrief)) {
      // Keep a scoped product-role candidate available even if a future
      // keyword rule lets a safe Respell survive one of these briefs.
      pairAccent = pickGuidedPair(await generateNames({
        ...cfg,
        variant: 'concept_pair',
        compound: false,
        count: guidedPairPool,
      }))
    }
    // A brief-driven page was the one surface where the engine could not say
    // why it chose a name: the reasoning family is the only construction that
    // arrives with a chain the card can show (Phase 143).
    const reasonPool = total > 0
      ? await generateNames({ ...cfg, variant: 'reason', compound: false, count: REASON_ACCENT_POOL })
      : []
    const reasonCandidate = pickReasonCandidate(reasonPool, cfg.seed)
    const primaryPage = preserveGuidedConstruction(mergeAutoBatches([
      brandableBatch,
      [],
      linkedRespells,
      metaphorAccent.slice(0, 1),
    ], total), metaphorAccent[0])
    const existingScopedPair = (namingToolBrief || legalResearchBrief)
      ? pairAccent.find((candidate) => (
          structuralQuality(candidate) >= RESPELL_COMPANION_PAIR_QUALITY_FLOOR
          && primaryPage.some((result) => (
            letters(result.name) === letters(candidate.name)
          ))
        ))
      : undefined
    const guidedPairCandidate = namingToolBrief
      ? existingScopedPair ?? pairAccent.find((candidate) => {
          const tail = ['loom', 'mint'].find((ending) => letters(candidate.name).endsWith(ending))
          return !tail || primaryPage.every((result) => !letters(result.name).endsWith(tail))
        })
      : legalResearchBrief
        ? existingScopedPair ?? pairAccent.find((candidate) => {
            const tail = ['lens', 'cite', 'proof']
              .find((ending) => letters(candidate.name).endsWith(ending))
            return !tail || primaryPage.filter((result) => (
              letters(result.name).endsWith(tail)
            )).length < 2
          }) ?? pairAccent[0]
        : deliveryTrackingBrief
          ? pairAccent.find((candidate) => letters(candidate.name) === 'shipops') ?? pairAccent[0]
          : cloudDeploymentBrief
            ? pairAccent.find((candidate) => letters(candidate.name) === 'skydock') ?? pairAccent[0]
            : pairAccent[0]
    const rolePreservedPage = preserveGuidedConstruction(primaryPage, existingScopedPair)
    const guidedPage = (() => {
      if (linkedRespells.length > 0) {
        if (legalResearchBrief) {
          return addQualityNeutralGuidedAlternative(rolePreservedPage, guidedPairCandidate)
        }
        return addStrongGuidedPairUpgrade(rolePreservedPage, guidedPairCandidate, namingToolBrief)
      }
      if (metaphorAccent.length > 0) {
        if (legalResearchBrief) {
          return addQualityNeutralGuidedAlternative(rolePreservedPage, guidedPairCandidate)
        }
        if (strongPairBrief) {
          return addStrongGuidedPairUpgrade(rolePreservedPage, guidedPairCandidate, namingToolBrief)
        }
        return addQualityNeutralGuidedAlternative(rolePreservedPage, metaphorAccent[1])
      }
      return addQualityNeutralGuidedAlternative(
        preserveGuidedConstruction(rolePreservedPage, guidedPairCandidate),
        guidedPairCandidate,
        namingToolBrief,
      )
    })()
    return offerReasoningSlot(guidedPage, reasonCandidate)
  }

  // Promptless Auto (Phase 142): the submorph dense-coinage engine leads the
  // page — meaning-dense two-syllable coinages (the Vercel construction, e.g.
  // Zendant, Synthos, Storcel) — while the classic four-mode sampler stays in
  // as accent variety. The reasoning family (Phase 143) carries four cards
  // rather than two: with no brief, a coinage has no domain to point at, so
  // the strongest promptless names are consistently the ones that arrive with
  // a story and a 🧭 chain (Regatta, Bottega, Kura). Brief-driven Auto above
  // is untouched.
  // Accent order matters: batches are round-robined by index, so whichever
  // comes first gets the earliest slots. Reasoning leads the accents because
  // on a promptless page it is the strongest thing the engine has - a coinage
  // with no brief has no domain to point at, while a story card always does.
  // The classic sampler keeps a smaller share: with no brief its Respell and
  // compound lanes have nothing to be specific about, and they produced the
  // weakest cards on the page (Mimize, Taperba, Micrall).
  const subs: Config[] = [
    { ...cfg, variant: 'submorph', compound: false, count: total },
    { ...cfg, variant: 'reason', compound: false, count: Math.max(3, Math.floor(total * 0.4)) },
    { ...cfg, variant: undefined, compound: false, count: Math.max(2, Math.floor(brandable / 2)) },
    { ...cfg, variant: 'realword', compound: false, count: Math.max(1, Math.floor(realword / 2)) },
    { ...cfg, variant: 'respell', compound: false, count: respell },
    { ...cfg, variant: undefined, compound: true, count: compound },
  ]
  const batches = await Promise.all(subs.map((c) => (c.count ? generateNames(c) : Promise.resolve([]))))
  // Split the reasoning batch in two and place the halves at either end of the
  // accent order. Accents are round-robined by index, so a single batch only
  // ever lands one card on a ten-name page however many it holds.
  const [submorphBatch, reasonBatch, ...restBatches] = batches
  const reasoningLead = reasonBatch.slice(0, 2)
  const reasoningTail = reasonBatch.slice(2)
  // Round-robin only the accent modes, then place them at even intervals among
  // the primary results. The old one-from-each round robin made three of the
  // first four cards accent modes even though the primary was the quality lead.
  return mergeAutoBatches(
    [submorphBatch, reasoningLead, ...restBatches.slice(0, 2), reasoningTail, ...restBatches.slice(2)],
    total,
  )
}

export interface BatchStats {
  count: number
  unique_pct: number
  avg_pronounce: number
  avg_novelty: number
  avg_memorability: number
  avg_length: number
  avg_syllables: number
  diversity: number
  best_index: number
}

export interface BatchMetrics {
  stats: BatchStats
  composites: number[]
}

// Structural "why this name" breakdown (Phase 36) — computed on demand in the
// engine, not during generation.
export interface Explanation {
  suffix: string | null
  stem: string | null
  prefix_word: string | null
  is_real_word: boolean
  syllables: number
  connotations: string[]
  score_pronounce: number
  score_novelty: number
  score_memorability: number
}

export async function explainName(name: string): Promise<Explanation> {
  await ensureInit()
  return JSON.parse(explain_name(name)) as Explanation
}

// The compiled product-name catalog owns its evidence. Do not initialize or
// query the legacy pronunciation/collision tables on this path.
export async function conceptDiagnostics(request: import('./concept-naming').NamingRequest): Promise<import('./concept-naming').ConceptRun> {
  await ensureInit()
  const value = JSON.parse(generate_concept_diagnostics(JSON.stringify(request)))
  if ('error' in value) throw new Error(value.error)
  return value
}

// The keyword stems the engine extracts from a description (Phase 48) —
// shown above results so users see exactly what drove their batch.
export async function extractKeywords(text: string): Promise<string[]> {
  await ensureInit()
  return JSON.parse(extract_keywords(text)) as string[]
}

export async function batchMetrics(results: NameResult[]): Promise<BatchMetrics> {
  await ensureInit()
  const json = batch_metrics(JSON.stringify(results))
  const parsed = JSON.parse(json) as BatchMetrics | { error: string }
  if ('error' in parsed) throw new Error((parsed as { error: string }).error)
  return parsed as BatchMetrics
}
