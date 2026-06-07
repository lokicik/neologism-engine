import type { BatchStats, Config, NameResult } from './engine'

// Pragmatic, transparent if-then tips driven by the batch's aggregate metrics.
// These are heuristic UX rules — not from any paper (unlike the diversity metric,
// which is Intra-List Average Distance, Ziegler et al. 2005).
export function recommendations(
  stats: BatchStats,
  config: Config,
  results: NameResult[],
): string[] {
  const tips: string[] = []
  if (stats.count === 0) return tips

  if (stats.avg_novelty < 50) {
    tips.push('Names lean close to real words — raise Randomness for more invented results.')
  }
  if (stats.avg_memorability < 45) {
    tips.push('Names run long — lower Max length for punchier, more brandable picks.')
  }
  if (stats.avg_pronounce < 55) {
    const soft = config.style === 'big_tech' ? '' : ' or try a softer variant (Stellar / Elvish)'
    tips.push(`These are hard to pronounce — lower Randomness${soft}.`)
  }
  if (stats.diversity < 0.45) {
    tips.push('Results look similar to each other — raise Variety for more spread of shapes and lengths.')
  }

  if (tips.length === 0) {
    const best = results[stats.best_index]
    if (best) tips.push(`Strong batch — top pick: ${best.name}.`)
  }
  return tips
}
