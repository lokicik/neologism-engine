import type { NameResult } from './engine'

export const TASTE_DATA_SCHEMA = 'neologism-taste-v2'
export const TASTE_EVIDENCE_TARGET = 10

export interface TasteExample {
  label: 'liked' | 'passed'
  result: NameResult
}

export interface TasteDataset {
  schema: typeof TASTE_DATA_SCHEMA
  exportedAt: string
  summary: {
    liked: number
    passed: number
    comparisons: number
    contexts: number
  }
  examples: TasteExample[]
  // Indices into examples: [preferred, rejected]. Keeping references compact
  // avoids repeating full result objects for every cross-product pair.
  comparisons: Array<[number, number]>
}

export interface TasteEvidenceProgress {
  matchedLiked: number
  matchedPassed: number
  matchedContexts: number
  likesNeeded: number
  passesNeeded: number
  ready: boolean
}

export function buildTasteDataset(
  favorites: NameResult[],
  rejected: NameResult[],
  exportedAt = new Date().toISOString(),
): TasteDataset {
  const examples: TasteExample[] = [
    ...favorites.map((result) => ({ label: 'liked' as const, result })),
    ...rejected.map((result) => ({ label: 'passed' as const, result })),
  ]
  const comparisons: Array<[number, number]> = []
  const contextIds = new Set<string>()
  let hasLegacyContext = false
  for (const { result } of examples) {
    if (result.tasteContext) contextIds.add(result.tasteContext.id)
    else hasLegacyContext = true
  }
  for (let liked = 0; liked < favorites.length; liked++) {
    for (let passed = 0; passed < rejected.length; passed++) {
      const likedContext = favorites[liked].tasteContext?.id
      const passedContext = rejected[passed].tasteContext?.id
      // New feedback is comparable only inside one project context. Historical
      // records predate context tagging, so preserve them together in one
      // explicit legacy bucket without mixing them into scoped projects.
      const sameContext = likedContext && passedContext
        ? likedContext === passedContext
        : !likedContext && !passedContext
      if (sameContext) comparisons.push([liked, favorites.length + passed])
    }
  }
  return {
    schema: TASTE_DATA_SCHEMA,
    exportedAt,
    summary: {
      liked: favorites.length,
      passed: rejected.length,
      comparisons: comparisons.length,
      contexts: contextIds.size + Number(hasLegacyContext),
    },
    examples,
    comparisons,
  }
}

// The scorer checkpoint needs evidence on both sides of a real project
// context. Raw totals are misleading: ten likes for project A and ten passes
// for project B produce no comparable preference at all. Count only unique
// examples that participate in at least one same-context comparison. This is
// still unary like/pass evidence, not a blinded head-to-head study.
export function tasteEvidenceProgress(
  favorites: NameResult[],
  rejected: NameResult[],
): TasteEvidenceProgress {
  const dataset = buildTasteDataset(favorites, rejected, '')
  const matchedLiked = new Set<string>()
  const matchedPassed = new Set<string>()
  const matchedContexts = new Set<string>()
  for (const [likedIndex, passedIndex] of dataset.comparisons) {
    const liked = dataset.examples[likedIndex]?.result
    const passed = dataset.examples[passedIndex]?.result
    const likedContext = liked?.tasteContext?.id
    const passedContext = passed?.tasteContext?.id
    // Legacy pairs remain in exports for backward-compatible audits, but an
    // absent context cannot prove that both labels answered the same brief.
    if (!likedContext || likedContext !== passedContext) continue
    matchedLiked.add(JSON.stringify([likedContext, liked.name.trim().toLowerCase()]))
    matchedPassed.add(JSON.stringify([passedContext, passed.name.trim().toLowerCase()]))
    matchedContexts.add(likedContext)
  }
  return {
    matchedLiked: matchedLiked.size,
    matchedPassed: matchedPassed.size,
    matchedContexts: matchedContexts.size,
    likesNeeded: Math.max(0, TASTE_EVIDENCE_TARGET - matchedLiked.size),
    passesNeeded: Math.max(0, TASTE_EVIDENCE_TARGET - matchedPassed.size),
    ready: matchedLiked.size >= TASTE_EVIDENCE_TARGET
      && matchedPassed.size >= TASTE_EVIDENCE_TARGET,
  }
}

export function exportTasteDataset(favorites: NameResult[], rejected: NameResult[]): void {
  const data = buildTasteDataset(favorites, rejected)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'neologism-taste.json'
  try {
    anchor.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}
