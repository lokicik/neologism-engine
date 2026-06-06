import init, { generate_names } from '../wasm/neologism_wasm.js'

export type Style = 'big_tech' | 'sci_fi' | 'fantasy'

export interface Config {
  style: Style
  count?: number
  min_len?: number
  max_len?: number
  temperature?: number
  seed?: number
  roots?: string[]
  variant?: string
}

export interface NameResult {
  name: string
  style: Style
  syllables: number
  score_pronounce: number
  score_novelty: number
  score_memorability: number
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
