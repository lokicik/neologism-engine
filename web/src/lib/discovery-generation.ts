import { generateBatch, generateColdLeadRetry, generateNames, type Config, type NameResult } from './engine'
import { buildReferencedProfile, coldQualityPoolCount, compoundTastePoolCount, feedbackForContext, fillColdLeadRetry, needsColdLeadRetry, needsQualityRepair, preferencePoolCount, prioritizeColdStrongLead, repairWeakShortlist, shortlistByPreference } from './preferences'
import { tasteContextForConfig } from './taste-context'

export const DEFAULT_CONFIG: Config = { style: 'big_tech', count: 10, min_len: 4, max_len: 12, temperature: 0.85, variety: 0.3, roots: [], variant: 'auto' }
export const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]
export const copyConfig = (config: Config): Config => ({ ...config, roots: [...(config.roots ?? [])], exclude: [...(config.exclude ?? [])] })

// The existing page-generation pipeline, separated from rendering. Selection,
// repair thresholds, and random streams retain their previous behavior.
export async function generateDiscoveryPage(cfg: Config, input: {
  favorites: NameResult[]; rejected: NameResult[]; references: string
  recent: string[]; seed: number; salt: number; append: boolean
}): Promise<NameResult[]> {
  const { favorites, rejected, references, recent, seed, salt, append } = input
  const feedback = feedbackForContext(favorites, rejected, tasteContextForConfig(cfg).id)
  const { profile } = buildReferencedProfile(feedback.favorites, feedback.rejected, references)
  const requestedCount = cfg.count ?? 10
  const generationCfg = { ...cfg, seed }
  const excluded = [...new Set([...recent, ...(cfg.exclude ?? [])])]
  const hasBrief = Boolean(cfg.description?.trim() || cfg.roots?.some(root => root.trim()))
  const compoundCount = cfg.style === 'big_tech' && cfg.variant === 'auto' && hasBrief ? compoundTastePoolCount(requestedCount, profile) : 0
  const [primaryPool, compoundPool] = await Promise.all([
    generateBatch({ ...generationCfg, count: preferencePoolCount(requestedCount, profile), exclude: excluded }),
    compoundCount > 0 ? generateNames({ ...generationCfg, variant: undefined, compound: true, count: compoundCount, exclude: excluded }) : Promise.resolve([]),
  ])
  let pool = [...primaryPool, ...compoundPool]
  let batch: NameResult[]
  if (!profile && cfg.variant === 'auto' && needsQualityRepair(primaryPool, requestedCount)) {
    const fallback = await generateNames({ ...generationCfg, variant: undefined, compound: false, count: coldQualityPoolCount(requestedCount), exclude: [...excluded, ...primaryPool.map(result => result.name)] })
    pool = [...primaryPool, ...fallback]
    batch = repairWeakShortlist(primaryPool, fallback, requestedCount)
  } else batch = shortlistByPreference(pool, profile, requestedCount, salt)
  if (!append && !profile && cfg.variant === 'auto') {
    batch = prioritizeColdStrongLead(batch)
    if (hasBrief && excluded.length === 0 && needsColdLeadRetry(batch)) {
      batch = fillColdLeadRetry(batch, await generateColdLeadRetry({ ...generationCfg, exclude: excluded }), pool)
    }
  }
  return batch
}
