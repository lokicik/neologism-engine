import init, {
  generate_names,
  batch_metrics,
  concept_coverages,
  lexical_hazards,
  explain_name,
  extract_keywords,
  load_semfield,
  load_pron_lexicon,
} from '../wasm/neologism_wasm.js'
import { autoModeCounts, isReadableAutoRespell, mergeAutoBatches } from './auto'
import { tasteContextForConfig } from './taste-context'

export type Style = 'big_tech' | 'sci_fi' | 'fantasy'
export type NamingMode = 'brandable' | 'realword' | 'respell' | 'compound' | 'seamblend' | 'morpheme'

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
}

const GUIDED_METAPHOR_POOL = 8
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
async function ensureSeamblendData() {
  if (!seamblendData) {
    seamblendData = (async () => {
      await ensureInit()
      const [neighbors, pron] = await Promise.all([
        import('../../../core/data/semfield/neighbors.tsv?raw'),
        import('../../../core/data/pron_lexicon.tsv?raw'),
      ])
      load_semfield(neighbors.default)
      load_pron_lexicon(pron.default)
    })().catch((error) => {
      seamblendData = null
      throw error
    })
  }
  await seamblendData
}

export async function generateNames(cfg: Config): Promise<NameResult[]> {
  await ensureInit()
  if (cfg.variant === 'seamblend' || cfg.variant === 'morpheme') await ensureSeamblendData()
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
  }

  const subs: Config[] = [
    { ...cfg, variant: undefined, compound: false, count: brandable },
    { ...cfg, variant: 'realword', compound: false, count: realword },
    { ...cfg, variant: 'respell', compound: false, count: respell },
    { ...cfg, variant: undefined, compound: true, count: compound },
  ]
  const batches = await Promise.all(subs.map((c) => (c.count ? generateNames(c) : Promise.resolve([]))))
  // Round-robin only the accent modes, then place them at even intervals among
  // Brandable results. The old one-from-each round robin made three of the first
  // four cards accent modes even though Brandable was the quality lead.
  return mergeAutoBatches(batches, total)
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
