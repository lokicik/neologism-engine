import type { BatchStats, Config, NameResult } from './engine'
import { pickShortlist } from './shortlist'

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

  // Phase 48: wording matches the current command-bar controls (Mode /
  // Length / Creativity chips) — the old tips referenced Randomness and
  // Variety sliders removed in Phase 41.
  if (stats.avg_novelty < 50) {
    tips.push('Names lean close to real words — try Wild creativity for more invented results.')
  }
  if (stats.avg_memorability < 45) {
    tips.push('Names run long — try Short length for punchier, more brandable picks.')
  }
  if (stats.avg_pronounce < 55) {
    tips.push('These are hard to pronounce — try Safe creativity.')
  }
  if (stats.diversity < 0.45) {
    const prompted = Boolean(config.description?.trim())
    const how = prompted
      ? 'a prompt focuses names on its keywords; reword it or try another mode for more spread'
      : 'try another mode or add seed words for more spread'
    tips.push(`Results look similar to each other — ${how}.`)
  }

  if (tips.length === 0) {
    // Phase 144: the page argues for finalists, and a second "top pick" chosen
    // on score alone contradicted it - the tip named Thundlt while the page
    // was making its case for Hanse. The shortlist is the page's answer, so
    // the tip defers to it.
    const [lead] = pickShortlist(results, () => undefined, 1)
    if (lead) tips.push(`Strong batch — leading with ${lead.name}.`)
  }
  return tips
}
