import init, { generate_names, batch_metrics, concept_coverages, explain_name, extract_keywords } from '../wasm/neologism_wasm.js'
import { autoModeCounts, isPromptLinkedRespell, mergeAutoBatches } from './auto'
import { tasteContextForConfig } from './taste-context'

export type Style = 'big_tech' | 'sci_fi' | 'fantasy'
export type NamingMode = 'brandable' | 'realword' | 'respell' | 'compound'

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
  construction?: 'guided_metaphor'
  constructionRank?: 1 | 2
  tasteContext?: TasteContext
  syllables: number
  score_pronounce: number
  score_novelty: number
  score_memorability: number
  concept_coverage?: number
  connotations: string[]
}

const GUIDED_METAPHOR_POOL = 8
const GUIDED_METAPHOR_QUALITY_FLOOR = 85
const GUIDED_METAPHOR_FALLBACK_SEED_OFFSET = 16
const COLD_LEAD_METAPHOR_RETRY_SEED_OFFSETS = [13, 521]
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

const addQualityNeutralGuidedAlternative = (
  page: NameResult[],
  candidate: NameResult | undefined,
): NameResult[] => {
  if (!candidate || page.some((result) => letters(result.name) === letters(candidate.name))) return page
  const quality = structuralQuality(candidate)
  const replacement = page
    .map((result, index) => ({ result, index, quality: structuralQuality(result) }))
    .filter(({ result, quality: replacedQuality }) => (
      isDirectSuffixForm(result) && replacedQuality <= quality + Number.EPSILON
    ))
    .sort((left, right) => left.quality - right.quality || right.index - left.index)[0]
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
      ? { ...result, construction: 'guided_metaphor', constructionRank: 1 }
      : result
  ))
}

let initialized = false

async function ensureInit() {
  if (!initialized) {
    await init()
    initialized = true
  }
}

export async function generateNames(cfg: Config): Promise<NameResult[]> {
  await ensureInit()
  const json = generate_names(JSON.stringify(cfg))
  const parsed = JSON.parse(json) as NameResult[] | { error: string }
  if ('error' in parsed) throw new Error((parsed as { error: string }).error)
  const results = parsed as NameResult[]
  const coverageJson = cfg.style === 'big_tech' && cfg.description?.trim()
    ? concept_coverages(cfg.description, JSON.stringify(results.map((result) => result.name)))
    : '[]'
  const coverages = JSON.parse(coverageJson) as number[] | { error: string }
  if ('error' in coverages) throw new Error((coverages as { error: string }).error)
  const tasteContext = tasteContextForConfig(cfg)
  const contextual = results.map((result, index) => ({
    ...result,
    concept_coverage: (coverages as number[])[index] ?? 0,
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
      : cfg.compound
        ? 'compound'
        : 'brandable'
  return contextual.map((result) => ({ ...result, sourceMode }))
}

// A cold-page retry is requested only after normal generation, repair, and
// lead ordering still leave a direct suffix first. Keep this pool separate so
// ordinary pages and continued sessions do not absorb another broad fallback.
export async function generateColdLeadRetry(cfg: Config): Promise<NameResult[]> {
  const batches = await Promise.all(COLD_LEAD_METAPHOR_RETRY_SEED_OFFSETS.map(async (offset) => (
    pickGuidedMetaphor(await generateNames({
      ...cfg,
      variant: 'metaphor',
      compound: false,
      count: GUIDED_METAPHOR_POOL,
      seed: guidedMetaphorFallbackSeed(cfg.seed, offset),
    }))
  )))
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
    const [brandableBatch, respellBatch] = await Promise.all([
      generateNames({ ...cfg, variant: undefined, compound: false, count: total }),
      respell > 0
        ? generateNames({ ...cfg, variant: 'respell', compound: false, count: respell })
        : Promise.resolve([]),
    ])
    const linkedRespells = respellBatch
      .filter((result) => isPromptLinkedRespell(result.name, terms))
      .slice(0, respell)
    // Respell owns the single guided accent when it is genuinely derived from
    // the brief. Otherwise let one strong semantic metaphor compete with the
    // Brandable page instead of widening the main generator's whole first pool.
    let metaphorAccent: NameResult[] = []
    if (total > 0 && linkedRespells.length === 0) {
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
    }
    const primaryPage = preserveGuidedConstruction(mergeAutoBatches([
      brandableBatch,
      [],
      linkedRespells,
      metaphorAccent.slice(0, 1),
    ], total), metaphorAccent[0])
    return linkedRespells.length === 0
      ? addQualityNeutralGuidedAlternative(primaryPage, metaphorAccent[1])
      : primaryPage
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
