import type { NameResult } from './engine'

export const TASTE_DATA_SCHEMA = 'neologism-taste-v2'

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

export function exportTasteDataset(favorites: NameResult[], rejected: NameResult[]): void {
  const data = buildTasteDataset(favorites, rejected)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'neologism-taste.json'
  anchor.click()
  URL.revokeObjectURL(url)
}
