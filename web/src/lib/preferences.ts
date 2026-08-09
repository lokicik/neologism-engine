import type { NameResult } from './engine'

// Client-side preference learning. The profile stays transparent and tiny: it
// learns structural taste from saved names, never sends them anywhere, and is
// rebuilt locally whenever favorites change.

const FRONT = new Set(['e', 'i', 'y'])
const BACK = new Set(['o', 'u'])
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y'])
const SHARP = new Set(['k', 't', 'x', 'z', 'q', 'v'])
const KNOWN_SUFFIXES = ['ify', 'ora', 'ium', 'io', 'ia', 'ix', 'ly', 'ai']

export interface PreferenceProfile {
  avgLength: number
  avgSyllables: number
  frontLean: number // share of (front - back) vowels, -1..1
  vowelEndRate: number
  sharpness: number
  compoundRate: number
  suffixes: Record<string, number>
  onsets: Record<string, number>
  bigrams: Record<string, number>
}

function letters(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

function frontLean(name: string): number {
  const chars = [...letters(name)]
  let front = 0
  let back = 0
  for (const c of chars) {
    if (FRONT.has(c)) front++
    else if (BACK.has(c)) back++
  }
  const total = front + back
  return total === 0 ? 0 : (front - back) / total
}

function sharpness(name: string): number {
  const chars = [...letters(name)]
  if (chars.length === 0) return 0
  return chars.filter((c) => SHARP.has(c)).length / chars.length
}

function isCompound(name: string): boolean {
  return /[a-z][A-Z]/.test(name)
}

function suffix(name: string): string {
  const lower = letters(name)
  return KNOWN_SUFFIXES.find((ending) => lower.endsWith(ending)) ?? lower.slice(-2)
}

function onset(name: string): string {
  return letters(name).slice(0, 2)
}

function bigrams(name: string): string[] {
  const lower = letters(name)
  const grams: string[] = []
  for (let i = 0; i + 1 < lower.length; i++) grams.push(lower.slice(i, i + 2))
  return grams
}

function normalizedCounts(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const value of values) {
    if (value) counts[value] = (counts[value] ?? 0) + 1
  }
  const total = values.length || 1
  for (const value of Object.keys(counts)) counts[value] /= total
  return counts
}

export function buildProfile(favorites: NameResult[]): PreferenceProfile | null {
  if (favorites.length < 3) return null
  const n = favorites.length
  return {
    avgLength: favorites.reduce((sum, item) => sum + letters(item.name).length, 0) / n,
    avgSyllables: favorites.reduce((sum, item) => sum + item.syllables, 0) / n,
    frontLean: favorites.reduce((sum, item) => sum + frontLean(item.name), 0) / n,
    vowelEndRate: favorites.reduce(
      (sum, item) => sum + Number(VOWELS.has(letters(item.name).slice(-1))),
      0,
    ) / n,
    sharpness: favorites.reduce((sum, item) => sum + sharpness(item.name), 0) / n,
    compoundRate: favorites.reduce((sum, item) => sum + Number(isCompound(item.name)), 0) / n,
    suffixes: normalizedCounts(favorites.map((item) => suffix(item.name))),
    onsets: normalizedCounts(favorites.map((item) => onset(item.name))),
    bigrams: normalizedCounts(favorites.flatMap((item) => bigrams(item.name))),
  }
}

// Higher = closer to the learned profile. Continuous shape penalties prevent
// overfitting to one saved name; suffix/onset/bigram affinity captures recurring
// taste such as Nomix + Lexix -> short, front-vowel, -ix coinages.
export function similarity(name: NameResult, profile: PreferenceProfile): number {
  const lower = letters(name.name)
  const lenDiff = Math.abs(lower.length - profile.avgLength) / 6
  const syllableDiff = Math.abs(name.syllables - profile.avgSyllables) / 2
  const leanDiff = Math.abs(frontLean(name.name) - profile.frontLean) * 0.45
  const vowelEndDiff = Math.abs(Number(VOWELS.has(lower.slice(-1))) - profile.vowelEndRate) * 0.4
  const sharpDiff = Math.abs(sharpness(name.name) - profile.sharpness) * 0.8
  const compoundDiff = Math.abs(Number(isCompound(name.name)) - profile.compoundRate) * 0.65

  const grams = bigrams(name.name)
  const bigramAffinity = grams.length === 0
    ? 0
    : grams.reduce((sum, gram) => sum + (profile.bigrams[gram] ?? 0), 0) / grams.length
  const suffixAffinity = profile.suffixes[suffix(name.name)] ?? 0
  const onsetAffinity = profile.onsets[onset(name.name)] ?? 0

  return suffixAffinity * 0.9
    + onsetAffinity * 0.25
    + bigramAffinity * 2.0
    - lenDiff
    - syllableDiff
    - leanDiff
    - vowelEndDiff
    - sharpDiff
    - compoundDiff
}

function engineQuality(result: NameResult): number {
  return (
    0.4 * result.score_pronounce
    + 0.3 * result.score_memorability
    + 0.3 * result.score_novelty
  ) / 100
}

export function rankByPreference(results: NameResult[], profile: PreferenceProfile): NameResult[] {
  return results
    .map((result, index) => ({
      result,
      index,
      score: similarity(result, profile) + engineQuality(result) * 0.3,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ result }) => result)
}
