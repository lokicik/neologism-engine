import init, { generate_names, batch_metrics, explain_name, extract_keywords } from '../wasm/neologism_wasm.js'

export type Style = 'big_tech' | 'sci_fi' | 'fantasy'

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
  syllables: number
  score_pronounce: number
  score_novelty: number
  score_memorability: number
  connotations: string[]
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
  return parsed as NameResult[]
}

// Auto mode (web-only meta-mode): blend the four engine modes into one batch.
// The engine never sees variant:'auto' — we fan out four real sub-calls
// (brandable-weighted), all sharing the exclude window, then dedupe by name and
// interleave one-from-each-mode. Shared by Create (Auto) and the AI Studio pool.
export async function generateBatch(cfg: Config): Promise<NameResult[]> {
  if (cfg.variant !== 'auto') return generateNames(cfg)
  const total = cfg.count ?? 10
  const realword = Math.max(1, Math.round(total * 0.2))
  const respell = Math.max(1, Math.round(total * 0.2))
  const compound = Math.max(1, Math.round(total * 0.1))
  const brandable = Math.max(1, total - realword - respell - compound)
  const subs: Config[] = [
    { ...cfg, variant: undefined, compound: false, count: brandable },
    { ...cfg, variant: 'realword', compound: false, count: realword },
    { ...cfg, variant: 'respell', compound: false, count: respell },
    { ...cfg, variant: undefined, compound: true, count: compound },
  ]
  const batches = await Promise.all(subs.map((c) => generateNames(c)))
  const seen = new Set<string>()
  const merged: NameResult[] = []
  const max = Math.max(0, ...batches.map((b) => b.length))
  for (let i = 0; i < max; i++) {
    for (const b of batches) {
      const r = b[i]
      if (r && !seen.has(r.name.toLowerCase())) {
        seen.add(r.name.toLowerCase())
        merged.push(r)
      }
    }
  }
  return merged
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
