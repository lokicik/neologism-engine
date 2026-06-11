import type { NameResult } from './engine'

// Single overall score — same formula as the engine's composite_score
// (0.40·pronounce + 0.30·memorability + 0.30·novelty).
export function composite(r: NameResult): number {
  return Math.round(
    0.4 * r.score_pronounce + 0.3 * r.score_memorability + 0.3 * r.score_novelty,
  )
}
