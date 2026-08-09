import type { NameResult } from './engine'

// Distribute secondary naming modes through the stronger Brandable stream while
// preserving each mode's own order and removing cross-mode duplicates.
export function mergeAutoBatches(batches: NameResult[][], total: number): NameResult[] {
  const primary = batches[0] ?? []
  const accents: NameResult[] = []
  const accentBatches = batches.slice(1)
  const accentMax = Math.max(0, ...accentBatches.map((batch) => batch.length))
  for (let i = 0; i < accentMax; i++) {
    for (const batch of accentBatches) {
      if (batch[i]) accents.push(batch[i])
    }
  }

  const scheduled = [
    ...primary.map((result, index) => ({
      result,
      position: (index + 0.5) / Math.max(1, primary.length),
      accent: false,
      index,
    })),
    ...accents.map((result, index) => ({
      result,
      position: (index + 1) / (accents.length + 1),
      accent: true,
      index,
    })),
  ].sort((a, b) => a.position - b.position || Number(a.accent) - Number(b.accent) || a.index - b.index)

  const seen = new Set<string>()
  const merged: NameResult[] = []
  for (const { result } of scheduled) {
    const key = result.name.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(result)
    }
  }
  return merged.slice(0, total)
}
