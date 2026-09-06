import type { Config, NameResult } from './engine'

export const DISCOVERY_KEY = 'neologism:discovery:v1'
export interface DiscoverySession {
  schema: 1; config: Config; generationConfig: Config; results: NameResult[]
  salt: number | null; exhausted: boolean; scrollY: number
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 20000 && value.every(item => typeof item === 'string' && item.length <= 1000)

function validConfig(value: unknown): value is Config {
  if (!record(value) || value.style !== 'big_tech' || value.variant !== 'auto' || value.compound === true || value.count !== 10) return false
  if (!finite(value.min_len) || !finite(value.max_len) || value.min_len < 1 || value.max_len > 80 || value.min_len > value.max_len) return false
  if (!finite(value.temperature) || !finite(value.variety)) return false
  if (value.seed !== undefined && (!finite(value.seed) || value.seed < 0)) return false
  for (const key of ['description', 'starts_with', 'contains']) if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > 1000)) return false
  return (value.roots === undefined || strings(value.roots)) && (value.exclude === undefined || strings(value.exclude))
}

function validResult(value: unknown): value is NameResult {
  if (!record(value) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 || /[\u0000-\u001f\u007f]/.test(value.name)) return false
  if (!['big_tech', 'sci_fi', 'fantasy'].includes(String(value.style))) return false
  if (!['syllables', 'score_pronounce', 'score_novelty', 'score_memorability'].every(key => finite(value[key]) && value[key] >= 0 && value[key] <= 100)) return false
  if (!strings(value.connotations) || value.reasonChain !== undefined && typeof value.reasonChain !== 'string') return false
  if (value.sourceMode !== undefined && !['brandable','realword','respell','compound','seamblend','morpheme','submorph','reason'].includes(String(value.sourceMode))) return false
  const context = value.tasteContext
  return context === undefined || context === null || record(context) && typeof context.id === 'string' && strings(context.roots) && (context.description === undefined || typeof context.description === 'string')
}

export function configIdentity(config: Config): string {
  return JSON.stringify([config.style, config.variant, !!config.compound, config.count, config.min_len, config.max_len, config.temperature, config.variety, config.seed ?? null, config.description?.trim() ?? '', config.roots ?? [], config.starts_with ?? '', config.contains ?? '', config.exclude ?? []])
}

export function readDiscovery(storage: Pick<Storage, 'getItem'>): { session: DiscoverySession | null; error: string | null } {
  try {
    const raw = storage.getItem(DISCOVERY_KEY)
    if (!raw) return { session: null, error: null }
    const value: unknown = JSON.parse(raw)
    if (!record(value) || value.schema !== 1 || !validConfig(value.config) || !validConfig(value.generationConfig) || !Array.isArray(value.results) || value.results.length > 20000 || !value.results.every(validResult) || typeof value.exhausted !== 'boolean' || !finite(value.scrollY) || value.scrollY < 0 || value.salt !== null && (!finite(value.salt) || value.salt < 0)) throw new Error('Invalid discovery')
    const names = value.results.map(result => result.name.trim().toLowerCase().normalize('NFC'))
    if (new Set(names).size !== names.length) throw new Error('Duplicate discovery names')
    return { session: value as unknown as DiscoverySession, error: null }
  } catch { return { session: null, error: 'Your previous discovery could not be restored. A new list will start.' } }
}

export function writeDiscovery(storage: Pick<Storage, 'setItem'>, session: DiscoverySession): string | null {
  try { storage.setItem(DISCOVERY_KEY, JSON.stringify(session)); return null }
  catch { return 'Your browser could not save this discovery. Reloading may lose the list; Save any names you want to keep.' }
}
