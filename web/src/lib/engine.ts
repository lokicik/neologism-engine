import init, { generate_names, batch_metrics } from '../wasm/neologism_wasm.js'

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

export async function batchMetrics(results: NameResult[]): Promise<BatchMetrics> {
  await ensureInit()
  const json = batch_metrics(JSON.stringify(results))
  const parsed = JSON.parse(json) as BatchMetrics | { error: string }
  if ('error' in parsed) throw new Error((parsed as { error: string }).error)
  return parsed as BatchMetrics
}
