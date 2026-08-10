import type { NameResult } from './engine'

export interface AutoModeCounts {
  brandable: number
  realword: number
  respell: number
  compound: number
}

// With a product brief, semantic Brandable names are the quality lead and a
// prompt-derived Respell may earn one accent slot. Prompt-independent Real-word
// and semantically uneven Compound names remain explicit choices instead of
// being forced into the first page. Without a brief, Auto keeps the broad mix.
export function autoModeCounts(total: number, hasBrief: boolean): AutoModeCounts {
  const count = Math.max(0, Math.floor(total))
  if (count < 4) {
    return { brandable: count, realword: 0, respell: 0, compound: 0 }
  }

  if (hasBrief) {
    const respell = Math.max(1, Math.floor(count * 0.1))
    return { brandable: count - respell, realword: 0, respell, compound: 0 }
  }

  const realword = Math.max(1, Math.floor(count * 0.3))
  const respell = Math.max(1, Math.floor(count * 0.1))
  const compound = Math.max(1, Math.floor(count * 0.1))
  const brandable = Math.max(1, count - realword - respell - compound)
  return { brandable, realword, respell, compound }
}

function letters(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '')
}

// Respell uses one deletion or substitution (Lyft/Tumblr-style). Keeping the
// same one-edit contract here prevents Auto from admitting a high-scoring but
// unrelated generic respelling when the prompt has no viable transformation.
export function isPromptLinkedRespell(name: string, terms: string[]): boolean {
  const candidate = letters(name)
  return terms.some((term) => {
    const source = letters(term)
    if (source.length < 4 || Math.abs(candidate.length - source.length) > 1) return false
    let edits = 0
    let i = 0
    let j = 0
    while (i < candidate.length && j < source.length) {
      if (candidate[i] === source[j]) {
        i++
        j++
        continue
      }
      if (++edits > 1) return false
      if (candidate.length < source.length) j++
      else if (candidate.length > source.length) i++
      else {
        i++
        j++
      }
    }
    return edits + Number(i < candidate.length || j < source.length) === 1
  })
}

// Auto should use Respell as a familiar brand accent, not as a license to
// remove any convenient vowel. Explicit Respell mode keeps the broader engine
// vocabulary; this presentation gate admits only compact, easily reversible
// Lyft/Tumblr-style spellings.
export function isReadableAutoRespell(name: string, terms: string[]): boolean {
  const candidate = letters(name)
  if (candidate.length > 7) return false

  return terms.some((term) => {
    const source = letters(term)
    if (source.length < 4) return false

    if (source.length === candidate.length) {
      const differences: number[] = []
      for (let index = 0; index < source.length; index++) {
        if (source[index] !== candidate[index]) differences.push(index)
      }
      const [index] = differences
      return differences.length === 1
        && (candidate.length <= 6 || index <= 2)
        && source[index] === 'i'
        && candidate[index] === 'y'
    }

    if (source.length === candidate.length + 1) {
      const index = source.length - 2
      return index >= 2
        && source[index] === 'e'
        && source.slice(0, index) + source.slice(index + 1) === candidate
    }

    return false
  })
}

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
