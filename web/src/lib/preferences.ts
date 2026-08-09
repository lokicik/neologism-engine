import type { NameResult, NamingMode } from './engine'

// Client-side preference learning. The profile stays transparent and tiny: it
// contrasts saved names with explicit passes (including their source naming
// mode), never sends either set anywhere, and is rebuilt locally whenever
// feedback changes.

const FRONT = new Set(['e', 'i', 'y'])
const BACK = new Set(['o', 'u'])
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y'])
const SHARP = new Set(['k', 't', 'x', 'z', 'q', 'v'])
const KNOWN_SUFFIXES = ['ify', 'ora', 'ium', 'io', 'ia', 'ix', 'ly', 'ai']
export const MIN_TASTE_SIGNALS = 3

interface ShapeProfile {
  avgLength: number
  avgSyllables: number
  frontLean: number // share of (front - back) vowels, -1..1
  vowelEndRate: number
  sharpness: number
  compoundRate: number
  suffixes: Record<string, number>
  onsets: Record<string, number>
  bigrams: Record<string, number>
  modes: Record<string, number>
}

export interface PreferenceProfile {
  liked: ShapeProfile | null
  avoided: ShapeProfile | null
  likedCount: number
  rejectedCount: number
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

function namingMode(item: NameResult): NamingMode | 'unknown' {
  if (item.sourceMode) return item.sourceMode
  return isCompound(item.name) ? 'compound' : 'unknown'
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

function concentratedAffinity(counts: Record<string, number>, value: string): number {
  const rate = counts[value] ?? 0
  // Auto exposes Brandable more often than its accent modes. Treat a mode as
  // taste only when feedback clearly concentrates there, not from a normal
  // mixed batch whose source distribution is already imbalanced.
  return rate >= 0.75 ? rate : 0
}

function buildShapeProfile(items: NameResult[]): ShapeProfile {
  const n = items.length
  return {
    avgLength: items.reduce((sum, item) => sum + letters(item.name).length, 0) / n,
    avgSyllables: items.reduce((sum, item) => sum + item.syllables, 0) / n,
    frontLean: items.reduce((sum, item) => sum + frontLean(item.name), 0) / n,
    vowelEndRate: items.reduce(
      (sum, item) => sum + Number(VOWELS.has(letters(item.name).slice(-1))),
      0,
    ) / n,
    sharpness: items.reduce((sum, item) => sum + sharpness(item.name), 0) / n,
    compoundRate: items.reduce((sum, item) => sum + Number(isCompound(item.name)), 0) / n,
    suffixes: normalizedCounts(items.map((item) => suffix(item.name))),
    onsets: normalizedCounts(items.map((item) => onset(item.name))),
    bigrams: normalizedCounts(items.flatMap((item) => bigrams(item.name))),
    modes: normalizedCounts(items.map(namingMode)),
  }
}

export function buildProfile(
  favorites: NameResult[],
  rejected: NameResult[] = [],
): PreferenceProfile | null {
  const liked = favorites.length >= MIN_TASTE_SIGNALS ? buildShapeProfile(favorites) : null
  // A positive centroid makes even one pass useful as a contrast. Without
  // likes, wait for three passes so an accidental click cannot define taste.
  const avoided = rejected.length >= (liked ? 1 : MIN_TASTE_SIGNALS)
    ? buildShapeProfile(rejected)
    : null
  if (!liked && !avoided) return null
  return {
    liked,
    avoided,
    likedCount: favorites.length,
    rejectedCount: rejected.length,
  }
}

// Higher = closer to the learned profile. Continuous shape penalties prevent
// overfitting to one saved name; suffix/onset/bigram affinity captures recurring
// taste such as Nomix + Lexix -> short, front-vowel, -ix coinages.
function shapeSimilarity(name: NameResult, profile: ShapeProfile): number {
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
  const modeAffinity = concentratedAffinity(profile.modes, namingMode(name))

  return suffixAffinity * 0.9
    + onsetAffinity * 0.25
    + bigramAffinity * 2.0
    + modeAffinity * 0.75
    - lenDiff
    - syllableDiff
    - leanDiff
    - vowelEndDiff
    - sharpDiff
    - compoundDiff
}

export function similarity(name: NameResult, profile: PreferenceProfile): number {
  const liked = profile.liked ? shapeSimilarity(name, profile.liked) : null
  if (!profile.avoided) return liked ?? 0

  // Compare the candidate with both centroids instead of applying an absolute
  // blacklist. The tanh bound prevents a narrow rejected cluster from
  // overpowering engine quality, while evidence scaling makes one accidental
  // pass a weak signal and five passes a full-strength signal.
  const avoided = shapeSimilarity(name, profile.avoided)
  const evidence = Math.min(1, profile.rejectedCount / 5)
  if (liked === null) return -Math.tanh(avoided) * evidence
  return liked + Math.tanh(liked - avoided) * evidence
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
